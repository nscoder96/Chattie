import twilio from 'twilio';
import { config } from '../config/index.js';

const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

export async function sendWhatsAppMessage(to: string, message: string): Promise<string> {
  // Ensure the 'to' number has whatsapp: prefix
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const result = await client.messages.create({
    body: message,
    from: config.TWILIO_WHATSAPP_NUMBER,
    to: toNumber,
  });

  console.log(`Sent WhatsApp message to ${to}, SID: ${result.sid}`);
  return result.sid;
}

export async function sendWhatsAppMedia(to: string, mediaUrl: string, caption?: string): Promise<string> {
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const result = await client.messages.create({
    body: caption || '',
    from: config.TWILIO_WHATSAPP_NUMBER,
    to: toNumber,
    mediaUrl: [mediaUrl],
  });

  return result.sid;
}

// Twilio webhook signature validation
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(
    config.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );
}

// Parse incoming Twilio WhatsApp webhook
export interface TwilioWhatsAppMessage {
  MessageSid: string;
  AccountSid: string;
  From: string;        // whatsapp:+31612345678
  To: string;          // whatsapp:+14155238886
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;  // First media URL if present
  MediaContentType0?: string;
  ProfileName?: string;
}

export function parsePhoneNumber(twilioFrom: string): string {
  // Remove 'whatsapp:' prefix if present
  return twilioFrom.replace('whatsapp:', '');
}
