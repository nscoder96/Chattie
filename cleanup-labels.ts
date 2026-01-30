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
  const response = await gmail.users.labels.list({ userId: 'me' });
  const labels = response.data.labels || [];

  // Show custom labels (not system labels)
  const custom = labels.filter(l => l.type === 'user');
  console.log(`Custom labels (${custom.length}):`);
  for (const label of custom) {
    console.log(`  - ${label.name} (${label.id})`);
  }
}

main().catch(console.error);
