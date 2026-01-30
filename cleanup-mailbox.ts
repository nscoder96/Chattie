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

interface EmailInfo {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  isWarmup: boolean;
  reason: string;
}

async function analyzeEmails(): Promise<EmailInfo[]> {
  // Get all recent inbox emails
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox newer_than:7d',
    maxResults: 100,
  });

  const emails: EmailInfo[] = [];

  for (const msg of response.data.messages || []) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject'],
    });

    const headers = detail.data.payload?.headers || [];
    const from = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const snippet = detail.data.snippet || '';

    // Detect warmup/cold outreach patterns
    const warmupIndicators = [
      // English cold outreach patterns
      /\b(outbound|prospecting|pipeline|demo|scale|growth hack|ROI|leads|cold email|outreach)\b/i,
      /\b(book a call|schedule a call|free consultation|let's connect|quick question)\b/i,
      /\b(PDZKZA2|ZJ0B9CJ|HD9XMYE|F79QBST|SZ68KJH|TQWCVVV|XEA9K9F|MDJHFXB|EK438PD)\b/, // Warmup tracking codes
      /\b(following up|just checking in|circling back|touching base)\b/i,
      /\b(instantly|apollo|lemlist|mailshake|woodpecker|reply\.io)\b/i, // Cold email tools
      // English promotional
      /\b(your trial|last chance|free domains|DFY|playbook)\b/i,
      /\b(unsubscribe|opt-out|stop receiving)\b/i,
      // Sender patterns
      /@(tiagomoita|thrivewellfundaccess|romanticlure|expertadvisorzone|theprovenexperiment|em\.tec80|vc1phx|discoversitejabb|coreopenevidence)\.com/i,
      /@(send\.calendly|mail\.airtable|instantly\.ai)\.com/i,
    ];

    // Dutch customer patterns (these should be KEPT)
    const dutchCustomerIndicators = [
      /\b(tuin|hovenier|offerte|aanvraag|graag|bedankt|groet)\b/i,
      /\b(gras|planten|schuur|vijver|schommel|snoei)\b/i,
      /@(gmail\.com|outlook\.com|hotmail\.com|live\.nl|ziggo\.nl|kpnmail\.nl|xs4all\.nl)/i,
      /spekreijse|bevisibleconsulting/i, // Known test senders
    ];

    const isWarmup = warmupIndicators.some(pattern =>
      pattern.test(from) || pattern.test(subject) || pattern.test(snippet)
    );

    const isDutchCustomer = dutchCustomerIndicators.some(pattern =>
      pattern.test(from) || pattern.test(subject) || pattern.test(snippet)
    );

    // Determine if it should be removed
    const shouldRemove = isWarmup && !isDutchCustomer;

    let reason = '';
    if (shouldRemove) {
      if (/PDZKZA2|ZJ0B9CJ/.test(subject)) reason = 'Warmup tracking code in subject';
      else if (warmupIndicators.some(p => p.test(from))) reason = 'Known warmup/spam sender';
      else if (/instantly|calendly|airtable/i.test(from)) reason = 'SaaS promotional';
      else reason = 'English cold outreach pattern';
    } else if (isDutchCustomer) {
      reason = 'Dutch customer email - KEEP';
    } else {
      reason = 'Unclear - manual review';
    }

    emails.push({
      id: msg.id!,
      from,
      subject,
      snippet: snippet.slice(0, 60),
      isWarmup: shouldRemove,
      reason,
    });
  }

  return emails;
}

async function main() {
  console.log('Analyzing mailbox...\n');

  const emails = await analyzeEmails();

  const toRemove = emails.filter(e => e.isWarmup);
  const toKeep = emails.filter(e => !e.isWarmup);

  console.log('=== EMAILS TO REMOVE (warmup/spam) ===\n');
  for (const e of toRemove) {
    console.log(`❌ ${e.from.slice(0, 40)}`);
    console.log(`   Subject: ${e.subject.slice(0, 50)}`);
    console.log(`   Reason: ${e.reason}`);
    console.log('');
  }

  console.log('\n=== EMAILS TO KEEP ===\n');
  for (const e of toKeep) {
    console.log(`✓ ${e.from.slice(0, 40)}`);
    console.log(`   Subject: ${e.subject.slice(0, 50)}`);
    console.log(`   Reason: ${e.reason}`);
    console.log('');
  }

  console.log(`\nSummary: ${toRemove.length} to remove, ${toKeep.length} to keep`);

  // Ask for confirmation
  if (toRemove.length > 0 && process.argv.includes('--delete')) {
    console.log('\n🗑️  Deleting warmup emails...');
    for (const e of toRemove) {
      await gmail.users.messages.trash({ userId: 'me', id: e.id });
      console.log(`   Trashed: ${e.subject.slice(0, 40)}`);
    }
    console.log('\n✅ Done! Emails moved to trash.');
  } else if (toRemove.length > 0) {
    console.log('\nRun with --delete flag to actually remove these emails.');
  }
}

main().catch(console.error);
