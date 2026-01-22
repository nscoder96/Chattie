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
      const email = await getEmailById(msg.id);
      if (email) messages.push(email);
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
