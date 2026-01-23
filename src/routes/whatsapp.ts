import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import { sendWhatsAppMessage, parsePhoneNumber, type TwilioWhatsAppMessage } from '../services/whatsapp.js';
import { generateResponse } from '../services/openai.js';
import { sendApprovalEmail } from '../services/gmail.js';
import {
  findOrCreateContact,
  getOrCreateConversation,
  saveMessage,
  createPendingResponse,
  updatePendingResponse,
  updateContactInfo,
} from '../services/database.js';
import type { ConversationContext } from '../types/index.js';

export const whatsappRouter = Router();

// Twilio sends webhooks as URL-encoded form data
import express from 'express';
whatsappRouter.use(express.urlencoded({ extended: false }));

// Incoming messages webhook (POST)
whatsappRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const message = req.body as TwilioWhatsAppMessage;

    // Respond immediately with empty TwiML to acknowledge receipt
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');

    // Process message asynchronously
    await handleIncomingMessage(message);
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    if (!res.headersSent) {
      res.set('Content-Type', 'text/xml');
      res.send('<Response></Response>');
    }
  }
});

// Status callback (optional, for delivery receipts)
whatsappRouter.post('/status', (req: Request, res: Response) => {
  const { MessageSid, MessageStatus } = req.body;
  console.log(`Message ${MessageSid} status: ${MessageStatus}`);
  res.sendStatus(200);
});

async function handleIncomingMessage(message: TwilioWhatsAppMessage) {
  const phone = parsePhoneNumber(message.From);
  const content = message.Body || '';
  const hasMedia = parseInt(message.NumMedia, 10) > 0;
  const contactName = message.ProfileName;

  console.log(`Incoming WhatsApp from ${phone}: ${content}`);

  // Find or create contact and conversation
  const contact = await findOrCreateContact(phone, contactName);
  const conversation = await getOrCreateConversation(contact.id, 'WHATSAPP');

  // If photo received, update contact and note it
  if (hasMedia && message.MediaUrl0) {
    const existingPhotos = JSON.parse(contact.gardenPhotos || '[]') as string[];
    existingPhotos.push(message.MediaUrl0);
    await updateContactInfo(contact.id, {
      gardenPhotos: JSON.stringify(existingPhotos),
    });
  }

  // Save incoming message
  const messageContent = hasMedia && !content ? '[Foto ontvangen]' : content;
  await saveMessage(conversation.id, contact.id, 'INBOUND', messageContent, message.MessageSid);

  // If conversation is paused (owner took over), don't respond with AI
  if (conversation.status === 'PAUSED') {
    console.log(`Conversation paused for ${phone} - skipping AI response`);
    return;
  }

  // Build conversation context for AI
  const context: ConversationContext = {
    contactPhone: contact.phone || undefined,
    contactEmail: contact.email || undefined,
    contactName: contact.name || undefined,
    gardenSize: contact.gardenSize || undefined,
    hasPhotos: !!contact.gardenPhotos && JSON.parse(contact.gardenPhotos).length > 0,
    messageHistory: conversation.messages.map(m => ({
      role: m.direction === 'INBOUND' ? 'customer' as const : 'assistant' as const,
      content: m.content,
    })),
  };

  // Generate AI response
  const aiResponse = await generateResponse(context, messageContent);

  // Update contact info if AI collected any
  if (aiResponse.collectedInfo) {
    const updates: Record<string, string> = {};
    if (aiResponse.collectedInfo.email) updates.email = aiResponse.collectedInfo.email;
    if (aiResponse.collectedInfo.name) updates.name = aiResponse.collectedInfo.name;
    if (aiResponse.collectedInfo.gardenSize) updates.gardenSize = aiResponse.collectedInfo.gardenSize;
    if (Object.keys(updates).length > 0) {
      await updateContactInfo(contact.id, updates);
    }
  }

  // Handle response based on mode
  if (config.RESPONSE_MODE === 'auto') {
    // Auto mode: send directly
    await sendWhatsAppMessage(phone, aiResponse.message);
    await saveMessage(conversation.id, contact.id, 'OUTBOUND', aiResponse.message);
    console.log(`Auto-sent response to ${phone}`);
  } else {
    // Approval mode: create pending response and send email
    const pending = await createPendingResponse(
      conversation.id,
      messageContent,
      aiResponse.message
    );

    const emailId = await sendApprovalEmail(
      phone,
      messageContent,
      aiResponse.message,
      'whatsapp',
      pending.id
    );

    await updatePendingResponse(pending.id, 'PENDING', emailId);
    console.log(`Sent approval email for message from ${phone}`);
  }
}
