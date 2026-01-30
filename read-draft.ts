import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

async function main() {
  const threadId = '19bfa94535d4dd1d'; // Niek Spekreijse thread

  const drafts = await gmail.users.drafts.list({ userId: 'me' });
  for (const draft of drafts.data.drafts || []) {
    const draftDetail = await gmail.users.drafts.get({ userId: 'me', id: draft.id! });
    if (draftDetail.data.message?.threadId === threadId) {
      // Get the raw content
      const payload = draftDetail.data.message?.payload;
      let body = '';
      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      } else if (payload?.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      }
      console.log('=== CONCEPT EMAIL AAN NIEK SPEKREIJSE ===\n');
      console.log(body);
    }
  }
}

main().catch(console.error);
