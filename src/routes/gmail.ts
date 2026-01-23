import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import {
  getUnreadEmails,
  markAsRead,
  createDraft,
  getThreadReplies,
} from '../services/gmail.js';
import { generateEmailDraft } from '../services/openai.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import {
  findPendingResponseByEmailId,
  updatePendingResponse,
  saveMessage,
  prisma,
} from '../services/database.js';

export const gmailRouter = Router();

// Manually trigger email check (for testing or cron)
gmailRouter.post('/check', async (_req: Request, res: Response) => {
  try {
    await checkForNewEmails();
    await checkForApprovalReplies();
    res.json({ success: true });
  } catch (error) {
    console.error('Error checking emails:', error);
    res.status(500).json({ error: 'Failed to check emails' });
  }
});

// Check for new customer emails and create drafts
export async function checkForNewEmails() {
  console.log('Checking for new customer emails...');

  const emails = await getUnreadEmails();

  for (const email of emails) {
    // Skip emails from the business owner (these are approvals)
    if (email.from.includes(config.BUSINESS_OWNER_EMAIL)) {
      continue;
    }

    // Skip Chattie notification emails
    if (email.subject.includes('[Chattie]')) {
      continue;
    }

    console.log(`Processing email from ${email.from}: ${email.subject}`);

    // Generate draft response
    const draftContent = await generateEmailDraft(
      { from: email.from, subject: email.subject, body: email.body },
      [] // Could add conversation history here
    );

    // Create draft reply
    const replySubject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    await createDraft(email.from, replySubject, draftContent, email.threadId);

    // Mark original as read
    await markAsRead(email.id);

    console.log(`Created draft reply for email from ${email.from}`);
  }
}

// Check for approval replies from business owner
export async function checkForApprovalReplies() {
  console.log('Checking for approval replies...');

  // Find pending responses that have an approval email
  const pendingResponses = await prisma.pendingResponse.findMany({
    where: {
      status: 'PENDING',
      approvalEmailId: { not: null },
    },
    include: {
      conversation: {
        include: { contact: true },
      },
    },
  });

  for (const pending of pendingResponses) {
    if (!pending.approvalEmailId) continue;

    // Find the thread for the approval email
    // The approvalEmailId is actually the message ID, we need to get its thread
    try {
      // Look for replies in the Gmail inbox that reference this pending response
      const emails = await getUnreadEmails();

      for (const email of emails) {
        // Check if this is a reply to an approval email
        if (!email.from.includes(config.BUSINESS_OWNER_EMAIL)) continue;
        if (!email.body.includes(`Ref: ${pending.id}`)) continue;

        // This is a reply to our approval request
        const replyBody = extractReplyContent(email.body);

        // Determine the action
        const normalizedReply = replyBody.toLowerCase().trim();
        const isApproval = ['ok', 'verstuur', 'goedgekeurd', 'ja', 'yes', 'send'].includes(normalizedReply);

        let messageToSend: string;

        if (isApproval) {
          // Use the suggested response
          messageToSend = pending.suggestedResponse;
          await updatePendingResponse(pending.id, 'APPROVED');
        } else if (replyBody.trim().length > 0) {
          // Use the modified response
          messageToSend = replyBody;
          await updatePendingResponse(pending.id, 'MODIFIED');
        } else {
          // Empty reply, skip
          continue;
        }

        // Send via WhatsApp
        const contact = pending.conversation.contact;
        if (contact.phone) {
          await sendWhatsAppMessage(contact.phone, messageToSend);
          await saveMessage(pending.conversationId, contact.id, 'OUTBOUND', messageToSend);
          console.log(`Sent approved response to ${contact.phone}`);
        }

        // Mark email as read
        await markAsRead(email.id);
      }
    } catch (error) {
      console.error(`Error processing approval for ${pending.id}:`, error);
    }
  }
}

// Extract the actual reply content (remove quoted text)
function extractReplyContent(emailBody: string): string {
  // Split by common reply markers
  const markers = [
    '\n\nOp ',      // Dutch: "Op [date] schreef..."
    '\n\nOn ',      // English: "On [date] wrote..."
    '\n\n---',      // Separator line
    '\n\n___',      // Separator line
    '═══',         // Our separator
    '\n\nVan:',    // Dutch: "Van: ..."
    '\n\nFrom:',   // English: "From: ..."
  ];

  let content = emailBody;

  for (const marker of markers) {
    const index = content.indexOf(marker);
    if (index > 0) {
      content = content.substring(0, index);
    }
  }

  return content.trim();
}

// Check for conversations that need follow-up drafts
export async function checkForFollowUps() {
  const conversations = await prisma.conversation.findMany({
    where: {
      needsFollowUp: true,
      nextFollowUpAt: { lte: new Date() },
    },
    include: { contact: true },
  });

  for (const conv of conversations) {
    const contact = conv.contact;
    const contactEmail = contact.email;

    if (!contactEmail) {
      console.log(`Skipping follow-up for ${contact.name || contact.phone} - no email`);
      continue;
    }

    const contactName = contact.name || 'klant';
    let subject: string;
    let body: string;

    if (conv.followUpCount === 1) {
      // First follow-up
      subject = `Opvolging - Uw aanvraag`;
      body = `Beste ${contactName},\n\nIk heb geprobeerd u telefonisch te bereiken, maar helaas kon ik u niet te pakken krijgen.\n\nHeeft u nog interesse in onze diensten? Ik help u graag verder. U kunt mij bereiken op dit e-mailadres of telefonisch.\n\nMet vriendelijke groet`;
    } else if (conv.followUpCount === 2) {
      // Second follow-up
      subject = `Nogmaals: Uw aanvraag`;
      body = `Beste ${contactName},\n\nIk heb opnieuw geprobeerd contact met u op te nemen, maar helaas zonder succes.\n\nMocht u nog steeds interesse hebben, dan hoor ik het graag. Ik sta voor u klaar.\n\nMet vriendelijke groet`;
    } else {
      // Third and final follow-up
      subject = `Laatste bericht: Uw aanvraag`;
      body = `Beste ${contactName},\n\nIk heb meerdere keren geprobeerd contact met u op te nemen, helaas zonder succes.\n\nIk sluit uw aanvraag voor nu af. Mocht u in de toekomst alsnog interesse hebben, dan bent u uiteraard van harte welkom om opnieuw contact met ons op te nemen.\n\nMet vriendelijke groet`;
    }

    // Create draft
    await createDraft(contactEmail, subject, body);
    console.log(`Created follow-up draft ${conv.followUpCount}/3 for ${contactName} (${contactEmail})`);

    // Update conversation
    if (conv.followUpCount >= 3) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { needsFollowUp: false, status: 'COMPLETED' },
      });
    }
  }
}

// Polling interval runner
let pollingInterval: NodeJS.Timeout | null = null;

export function startEmailPolling(intervalMs: number = 60000) {
  console.log(`Starting email polling every ${intervalMs / 1000} seconds`);

  // Run immediately
  checkForNewEmails().catch(console.error);
  checkForApprovalReplies().catch(console.error);
  checkForFollowUps().catch(console.error);

  // Then run on interval
  pollingInterval = setInterval(async () => {
    try {
      await checkForNewEmails();
      await checkForApprovalReplies();
      await checkForFollowUps();
    } catch (error) {
      console.error('Error in email polling:', error);
    }
  }, intervalMs);
}

export function stopEmailPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('Email polling stopped');
  }
}
