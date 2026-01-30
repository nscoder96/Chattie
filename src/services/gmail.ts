import { google } from 'googleapis';
import { config } from '../config/index.js';

const oauth2Client = new google.auth.OAuth2(
  config.GMAIL_CLIENT_ID,
  config.GMAIL_CLIENT_SECRET,
  config.GMAIL_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: config.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
}

export async function getUnreadEmails(): Promise<EmailMessage[]> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults: 10,
  });

  const messages: EmailMessage[] = [];

  for (const msg of response.data.messages || []) {
    if (msg.id) {
      try {
        const email = await getEmailById(msg.id);
        if (email) messages.push(email);
      } catch (error) {
        console.error(`Error fetching email ${msg.id}:`, error);
      }
    }
  }

  return messages;
}

// Get emails that haven't been processed by Chattie yet
// Checks if the email already has a classification label (Klant, Spam, etc.)
// so emails opened manually in Gmail are still processed
export async function getUnprocessedEmails(): Promise<EmailMessage[]> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: `in:inbox -label:Klant -label:Ongewenst -label:Leverancier -label:Intern -label:Overig newer_than:3d`,
    maxResults: 10,
  });

  const messages: EmailMessage[] = [];

  for (const msg of response.data.messages || []) {
    if (msg.id) {
      try {
        const email = await getEmailById(msg.id);
        if (email) messages.push(email);
      } catch (error) {
        console.error(`Error fetching email ${msg.id}:`, error);
      }
    }
  }

  return messages;
}

export async function getEmailById(messageId: string): Promise<EmailMessage | null> {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = response.data.payload?.headers || [];
  const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  // Extract body
  let body = '';
  const payload = response.data.payload;

  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  } else if (payload?.parts) {
    // Multipart message - find text/plain part
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
  }

  return {
    id: messageId,
    threadId: response.data.threadId || '',
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    body,
    date: new Date(getHeader('Date')),
  };
}

export async function createDraft(
  to: string,
  subject: string,
  body: string,
  threadId?: string
): Promise<string> {
  // Create email in RFC 2822 format
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encodedEmail = Buffer.from(email).toString('base64url');

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: encodedEmail,
        threadId,
      },
    },
  });

  return response.data.id || '';
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  threadId?: string
): Promise<string> {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encodedEmail = Buffer.from(email).toString('base64url');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail,
      threadId,
    },
  });

  return response.data.id || '';
}

export async function sendApprovalEmail(
  originalFrom: string,
  originalMessage: string,
  suggestedResponse: string,
  channel: 'whatsapp' | 'email',
  pendingResponseId: string
): Promise<string> {
  const subject = `[Chattie] Nieuw ${channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'} bericht - Goedkeuring gevraagd`;

  const body = `Je hebt een nieuw ${channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'} bericht ontvangen.

═══════════════════════════════════════
BERICHT VAN KLANT
═══════════════════════════════════════
Van: ${originalFrom}

${originalMessage}

═══════════════════════════════════════
VOORGESTELD ANTWOORD
═══════════════════════════════════════
${suggestedResponse}

═══════════════════════════════════════
WAT WIL JE DOEN?
═══════════════════════════════════════
• Goedkeuren: Antwoord op deze e-mail met alleen "OK" of "Verstuur"
• Aanpassen: Antwoord met je aangepaste tekst
• Negeren: Doe niets, bericht wordt niet verstuurd

─────────────────────────────────────
Ref: ${pendingResponseId}
`;

  return sendEmail(config.BUSINESS_OWNER_EMAIL, subject, body);
}

export async function markAsRead(messageId: string): Promise<void> {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'],
    },
  });
}

// Label management for email classification
const labelCache = new Map<string, string>(); // name -> id

export async function getOrCreateLabel(labelName: string): Promise<string> {
  // Check cache first
  if (labelCache.has(labelName)) {
    return labelCache.get(labelName)!;
  }

  // List existing labels
  const response = await gmail.users.labels.list({ userId: 'me' });
  const existing = response.data.labels?.find(l => l.name === labelName);
  if (existing?.id) {
    labelCache.set(labelName, existing.id);
    return existing.id;
  }

  // Create label
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  const labelId = created.data.id || '';
  labelCache.set(labelName, labelId);
  return labelId;
}

const LABEL_NAMES: Record<string, string> = {
  CUSTOMER: 'Klant',
  SUPPLIER: 'Leverancier',
  SPAM: 'Ongewenst',
  INTERNAL: 'Intern',
  OTHER: 'Overig',
};

// All classification label names (used to detect already-processed emails)
const ALL_CLASSIFICATION_LABELS = Object.values(LABEL_NAMES);

export async function addLabel(messageId: string, classification: string): Promise<void> {
  const labelName = LABEL_NAMES[classification] || classification;
  try {
    const labelId = await getOrCreateLabel(labelName);
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
  } catch (error) {
    console.error(`Failed to add label ${labelName} to message ${messageId}:`, error);
  }
}

// Check if a message already has one of our classification labels
export async function hasClassificationLabel(messageId: string): Promise<boolean> {
  // Build a set of label IDs for our classification labels
  const classificationLabelIds: string[] = [];
  for (const name of ALL_CLASSIFICATION_LABELS) {
    if (labelCache.has(name)) {
      classificationLabelIds.push(labelCache.get(name)!);
    } else {
      // Try to find without creating
      try {
        const response = await gmail.users.labels.list({ userId: 'me' });
        const existing = response.data.labels?.find(l => l.name === name);
        if (existing?.id) {
          labelCache.set(name, existing.id);
          classificationLabelIds.push(existing.id);
        }
      } catch { /* ignore */ }
    }
  }

  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'minimal',
  });
  const labels = detail.data.labelIds || [];
  return labels.some(id => classificationLabelIds.includes(id));
}

export async function getThreadReplies(threadId: string): Promise<EmailMessage[]> {
  const response = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  const messages: EmailMessage[] = [];

  for (const msg of response.data.messages || []) {
    if (msg.id) {
      const email = await getEmailById(msg.id);
      if (email) messages.push(email);
    }
  }

  return messages;
}
