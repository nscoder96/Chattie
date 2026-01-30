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
  // Search for Spekreijse/speckreizen emails
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'spekreijse OR speckreizen OR from:niek newer_than:1d',
    maxResults: 10,
  });
  console.log('Found messages:', res.data.resultSizeEstimate);

  for (const msg of res.data.messages || []) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const headers = detail.data.payload?.headers || [];
    const get = (n: string) => headers.find(h => h.name === n)?.value || '';
    const labels = detail.data.labelIds || [];
    console.log('---');
    console.log('ID:', msg.id);
    console.log('From:', get('From'));
    console.log('Subject:', get('Subject'));
    console.log('Date:', get('Date'));
    console.log('Labels:', labels.join(', '));
    console.log('Is unread:', labels.includes('UNREAD'));
  }

  // Also show all recent unread emails
  console.log('\n=== ALL UNREAD EMAILS ===');
  const unread = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults: 10,
  });
  console.log('Unread count:', unread.data.resultSizeEstimate);
  for (const msg of unread.data.messages || []) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const headers = detail.data.payload?.headers || [];
    const get = (n: string) => headers.find(h => h.name === n)?.value || '';
    console.log(`- ${get('From')} | ${get('Subject')}`);
  }
}

main().catch(console.error);
