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

async function deleteByQuery(query: string, description: string, dryRun = false): Promise<number> {
  console.log(`\n🔍 ${description}`);
  console.log(`   Query: ${query}`);

  let totalDeleted = 0;
  let pageToken: string | undefined;

  do {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      pageToken,
    });

    const messages = response.data.messages || [];
    if (messages.length === 0) break;

    console.log(`   Found ${messages.length} emails...`);

    if (!dryRun) {
      // Batch delete by moving to trash
      for (const msg of messages) {
        await gmail.users.messages.trash({ userId: 'me', id: msg.id! });
      }
      console.log(`   ✓ Trashed ${messages.length} emails`);
    } else {
      console.log(`   [DRY RUN] Would trash ${messages.length} emails`);
    }

    totalDeleted += messages.length;
    pageToken = response.data.nextPageToken || undefined;

    // Safety limit per query
    if (totalDeleted >= 2000) {
      console.log(`   ⚠️  Reached 2000 limit for this query, moving on...`);
      break;
    }
  } while (pageToken);

  return totalDeleted;
}

async function main() {
  const dryRun = !process.argv.includes('--delete');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           VOLLEDIGE MAILBOX OPSCHONING                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - geen emails worden verwijderd');
    console.log('   Voeg --delete toe om echt te verwijderen\n');
  }

  let totalDeleted = 0;

  // 1. Warmup emails met tracking codes
  totalDeleted += await deleteByQuery(
    'in:inbox subject:PDZKZA2',
    'Warmup emails met PDZKZA2 tracking code',
    dryRun
  );

  totalDeleted += await deleteByQuery(
    'in:inbox subject:ZJ0B9CJ',
    'Warmup emails met ZJ0B9CJ tracking code',
    dryRun
  );

  // 2. Bekende spam/warmup domeinen
  const spamDomains = [
    'meetmextomorrow.com', 'thrilllure.com', 'lovershive.com', 'intimatematchs.com',
    'maturesmatch.com', 'meetingcute.com', 'ecstatichook.com', 'romanticlure.com',
    'theprovenexperiment.com', 'expertadvisorzone.com', 'thrivewellfundaccess.com',
    'tiagomoita.com', 'em.tec80.com', 'em.tec35.com', 'vc1phx.com',
    'discoversitejabb', 'coreopenevidence.com', 'outboundprospectingleads.com',
  ];

  for (const domain of spamDomains) {
    totalDeleted += await deleteByQuery(
      `in:inbox from:${domain}`,
      `Spam van ${domain}`,
      dryRun
    );
  }

  // 3. Cold outreach patronen
  const coldOutreachPatterns = [
    'subject:"need to talk"',
    'subject:"let\'s chat"',
    'subject:"quick question" -from:me',
    'subject:"following up" -from:me',
    'subject:"checking in" -from:me',
    'subject:"I\'m ready to buy"',
    'subject:"do you need more leads"',
    'subject:"let\'s schedule a call"',
    'subject:"book a call"',
    'subject:"project requirements" from:romanticlure OR from:maturesmatch',
  ];

  for (const pattern of coldOutreachPatterns) {
    totalDeleted += await deleteByQuery(
      `in:inbox ${pattern}`,
      `Cold outreach: ${pattern}`,
      dryRun
    );
  }

  // 4. SaaS promotional emails (keep unsubscribed but clean inbox)
  const saasPromo = [
    'from:mail.airtable.com',
    'from:send.calendly.com',
    'from:instantly.ai',
    'from:mail.apollo.io',
    'from:hello@apify.com subject:trial OR subject:expir OR subject:usage',
  ];

  for (const pattern of saasPromo) {
    totalDeleted += await deleteByQuery(
      `in:inbox ${pattern}`,
      `SaaS promo: ${pattern}`,
      dryRun
    );
  }

  // 5. Final count
  const inboxCount = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox',
    maxResults: 1,
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`Totaal ${dryRun ? 'te verwijderen' : 'verwijderd'}: ${totalDeleted} emails`);
  console.log(`Geschat resterend in inbox: ${inboxCount.data.resultSizeEstimate || '?'}`);
  console.log('════════════════════════════════════════════════════════════');

  if (dryRun && totalDeleted > 0) {
    console.log('\n🚀 Voer uit met --delete om deze emails te verwijderen:');
    console.log('   npx tsx cleanup-full-mailbox.ts --delete');
  }
}

main().catch(console.error);
