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
  console.log('Fetching drafts...\n');

  const drafts = await gmail.users.drafts.list({ userId: 'me', maxResults: 200 });
  const allDrafts = drafts.data.drafts || [];

  console.log(`Found ${allDrafts.length} drafts total\n`);

  // Get details of each draft
  const toDelete: { id: string; to: string; subject: string }[] = [];
  const toKeep: { id: string; to: string; subject: string }[] = [];

  for (const draft of allDrafts) {
    const detail = await gmail.users.drafts.get({ userId: 'me', id: draft.id! });
    const headers = detail.data.message?.payload?.headers || [];
    const to = headers.find(h => h.name === 'To')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';

    // Check if it's a reply to warmup/spam
    const isSpamReply = /PDZKZA2|ZJ0B9CJ/.test(subject) ||
      /@(tiagomoita|thrivewellfundaccess|romanticlure|expertadvisorzone|theprovenexperiment|em\.tec|vc1phx|discoversitejabb|coreopenevidence|meetmextomorrow|thrilllure|lovershive|intimatematchs|maturesmatch|meetingcute|ecstatichook)/.test(to);

    // Check if it's a Dutch customer reply (keep these)
    const isDutchCustomer = /spekreijse|bevisibleconsulting|tuin|aanvraag|offerte/i.test(to + subject);

    if (isSpamReply && !isDutchCustomer) {
      toDelete.push({ id: draft.id!, to, subject });
    } else {
      toKeep.push({ id: draft.id!, to, subject });
    }
  }

  console.log('=== DRAFTS TO DELETE (spam replies) ===\n');
  for (const d of toDelete.slice(0, 20)) {
    console.log(`❌ To: ${d.to.slice(0, 40)}`);
    console.log(`   Subject: ${d.subject.slice(0, 50)}`);
  }
  if (toDelete.length > 20) console.log(`   ... and ${toDelete.length - 20} more\n`);

  console.log('\n=== DRAFTS TO KEEP ===\n');
  for (const d of toKeep) {
    console.log(`✓ To: ${d.to.slice(0, 40)}`);
    console.log(`   Subject: ${d.subject.slice(0, 50)}`);
  }

  console.log(`\nSummary: ${toDelete.length} to delete, ${toKeep.length} to keep`);

  if (toDelete.length > 0 && process.argv.includes('--delete')) {
    console.log('\n🗑️  Deleting spam reply drafts...');
    for (const d of toDelete) {
      await gmail.users.drafts.delete({ userId: 'me', id: d.id });
    }
    console.log(`\n✅ Deleted ${toDelete.length} drafts.`);
  } else if (toDelete.length > 0) {
    console.log('\nRun with --delete flag to remove these drafts.');
  }
}

main().catch(console.error);
