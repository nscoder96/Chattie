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
  const messageId = '19bfa94535d4dd1d'; // Niek Spekreijse "Tuin" email

  // Find the "Klant" label ID
  const labelsRes = await gmail.users.labels.list({ userId: 'me' });
  const klantLabel = labelsRes.data.labels?.find(l => l.name === 'Klant');

  if (klantLabel?.id) {
    // Remove the Klant label so it gets reprocessed
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: [klantLabel.id],
      },
    });
    console.log('Removed "Klant" label from Niek Spekreijse email — will be reprocessed on next poll');
  } else {
    console.log('Klant label not found');
  }

  // Also delete existing draft replies for this thread
  const detail = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'minimal' });
  const threadId = detail.data.threadId;
  console.log('Thread ID:', threadId);

  const drafts = await gmail.users.drafts.list({ userId: 'me' });
  for (const draft of drafts.data.drafts || []) {
    const draftDetail = await gmail.users.drafts.get({ userId: 'me', id: draft.id! });
    if (draftDetail.data.message?.threadId === threadId) {
      await gmail.users.drafts.delete({ userId: 'me', id: draft.id! });
      console.log('Deleted old draft for this thread');
    }
  }

  console.log('Done. Email will be reprocessed with improved prompt on next poll cycle.');
}

main().catch(console.error);
