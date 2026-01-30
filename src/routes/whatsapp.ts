import { Router, Request, Response } from 'express';
import express from 'express';
import { config } from '../config/index.js';
import { sendWhatsAppMessage as sendViaTwilio, parsePhoneNumber, type TwilioWhatsAppMessage } from '../services/whatsapp.js';
import {
  sendWhatsAppMessage as sendViaUnipile,
  sendMessageToChat,
  isOwnMessage,
  extractPhoneFromProviderId,
  type UnipileWebhookPayload,
} from '../services/unipile.js';
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

// Determine which WhatsApp provider to use
const useUnipile = !!config.UNIPILE_API_KEY;

// Send WhatsApp message via configured provider
async function sendWhatsAppMessage(phone: string, message: string, chatId?: string): Promise<string> {
  if (useUnipile) {
    // If we have a chat ID, use it to reply in the same conversation
    if (chatId) {
      return sendMessageToChat(chatId, message);
    }
    return sendViaUnipile(phone, message);
  }
  return sendViaTwilio(phone, message);
}

// Twilio sends webhooks as URL-encoded form data
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

// Status callback (optional, for delivery receipts) - Twilio
whatsappRouter.post('/status', (req: Request, res: Response) => {
  const { MessageSid, MessageStatus } = req.body;
  console.log(`Message ${MessageSid} status: ${MessageStatus}`);
  res.sendStatus(200);
});

// ============ UNIPILE WEBHOOK ============

// Unipile sends webhooks as JSON
whatsappRouter.post('/unipile', express.json(), async (req: Request, res: Response) => {
  try {
    const payload = req.body as UnipileWebhookPayload;

    // Respond immediately to acknowledge receipt
    res.status(200).json({ status: 'received' });

    // Only process incoming messages (not our own)
    if (payload.event !== 'message_received') {
      console.log(`Unipile event: ${payload.event} (ignored)`);
      return;
    }

    if (isOwnMessage(payload)) {
      console.log('Ignoring own message from Unipile');
      return;
    }

    // Process message asynchronously
    await handleUnipileMessage(payload);
  } catch (error) {
    console.error('Error processing Unipile webhook:', error);
    if (!res.headersSent) {
      res.status(200).json({ status: 'error' });
    }
  }
});

async function handleUnipileMessage(payload: UnipileWebhookPayload) {
  const phone = extractPhoneFromProviderId(payload.sender.attendee_provider_id);
  const content = payload.message || '';
  const hasMedia = (payload.attachments?.length || 0) > 0;
  const contactName = payload.sender.attendee_name;
  const chatId = payload.chat_id;

  console.log(`Incoming WhatsApp (Unipile) from ${phone}: ${content}`);

  // Find or create contact and conversation
  const contact = await findOrCreateContact(phone, contactName);
  const conversation = await getOrCreateConversation(contact.id, 'WHATSAPP');

  // If photo received, update contact and note it
  if (hasMedia && payload.attachments) {
    const existingPhotos = JSON.parse(contact.gardenPhotos || '[]') as string[];
    for (const attachment of payload.attachments) {
      if (attachment.url) {
        existingPhotos.push(attachment.url);
      }
    }
    await updateContactInfo(contact.id, {
      gardenPhotos: JSON.stringify(existingPhotos),
    });
  }

  // Save incoming message
  const messageContent = hasMedia && !content ? '[Foto ontvangen]' : content;
  await saveMessage(conversation.id, contact.id, 'INBOUND', messageContent, payload.message_id);

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
    // Auto mode: send directly using chat ID for reply
    await sendWhatsAppMessage(phone, aiResponse.message, chatId);
    await saveMessage(conversation.id, contact.id, 'OUTBOUND', aiResponse.message);
    console.log(`Auto-sent response to ${phone} via Unipile`);
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
