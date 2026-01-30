import { config } from '../config/index.js';

// DSN can include port, e.g., "api3.unipile.com:13311"
const dsn = config.UNIPILE_DSN || 'api1.unipile.com';
const UNIPILE_BASE_URL = `https://${dsn}/api/v1`;

interface UnipileMessageResponse {
  message_id: string;
  chat_id: string;
}

/**
 * Send a WhatsApp message via Unipile API
 * @param phone - Phone number in international format (e.g., +31612345678)
 * @param message - The message text to send
 * @returns The message ID from Unipile
 */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<string> {
  // Format phone number for WhatsApp: remove + and add @s.whatsapp.net
  const formattedPhone = phone.replace(/^\+/, '').replace(/\D/g, '');
  const whatsappId = `${formattedPhone}@s.whatsapp.net`;

  console.log(`Sending WhatsApp message via Unipile to ${phone}`);

  const response = await fetch(`${UNIPILE_BASE_URL}/chats`, {
    method: 'POST',
    headers: {
      'X-API-KEY': config.UNIPILE_API_KEY || '',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_id: config.UNIPILE_ACCOUNT_ID,
      text: message,
      attendees_ids: [whatsappId],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Unipile API error:', error);
    throw new Error(`Failed to send WhatsApp message: ${response.status} ${error}`);
  }

  const data = await response.json() as UnipileMessageResponse;
  console.log(`Message sent successfully, chat_id: ${data.chat_id}`);

  return data.message_id || data.chat_id;
}

/**
 * Send a message to an existing chat
 * @param chatId - The Unipile chat ID
 * @param message - The message text to send
 */
export async function sendMessageToChat(chatId: string, message: string): Promise<string> {
  console.log(`Sending message to chat ${chatId}`);

  const response = await fetch(`${UNIPILE_BASE_URL}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'X-API-KEY': config.UNIPILE_API_KEY || '',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: message,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Unipile API error:', error);
    throw new Error(`Failed to send message to chat: ${response.status} ${error}`);
  }

  const data = await response.json() as { message_id?: string };
  return data.message_id || chatId;
}

/**
 * Parse incoming Unipile webhook payload
 */
export interface UnipileWebhookPayload {
  account_id: string;
  account_type: string;
  event: string;
  chat_id: string;
  message_id: string;
  message: string;
  sender: {
    attendee_id: string;
    attendee_name: string;
    attendee_provider_id: string;
  };
  attendees: Array<{
    attendee_id: string;
    attendee_name: string;
    attendee_provider_id: string;
  }>;
  attachments?: Array<{
    type: string;
    url: string;
  }>;
  account_info?: {
    user_id: string;
  };
}

/**
 * Check if the message was sent by the connected account (not incoming)
 */
export function isOwnMessage(payload: UnipileWebhookPayload): boolean {
  return payload.account_info?.user_id === payload.sender.attendee_provider_id;
}

/**
 * Extract phone number from WhatsApp provider ID
 * @param providerId - e.g., "31612345678@s.whatsapp.net"
 * @returns Phone number with + prefix, e.g., "+31612345678"
 */
export function extractPhoneFromProviderId(providerId: string): string {
  const match = providerId.match(/^(\d+)@/);
  if (match) {
    return `+${match[1]}`;
  }
  return providerId;
}
