import http from 'http';
import { google } from 'googleapis';

const CLIENT_ID = '83139545703-iirdv1c1sjoqqom3p21m3q05cnsfgi1q.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/auth/callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://mail.google.com/'],
});

console.log('\n=== Gmail OAuth Setup ===\n');
console.log('Open deze URL in je browser:\n');
console.log(authUrl);
console.log('\nWachten op callback...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/auth/callback')) return;

  const url = new URL(req.url, 'http://localhost:3000');
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('Geen code ontvangen. Probeer opnieuw.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Gelukt!</h1><p>Je kunt dit venster sluiten en teruggaan naar de terminal.</p>');

    console.log('=== TOKENS ===\n');
    console.log('GMAIL_CLIENT_ID=' + CLIENT_ID);
    console.log('GMAIL_CLIENT_SECRET=' + CLIENT_SECRET);
    console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nKopieer deze waarden naar je .env en Railway variables.\n');

    server.close();
    process.exit(0);
  } catch (error) {
    res.end('Fout bij het ophalen van tokens: ' + error);
    console.error('Error:', error);
  }
});

server.listen(3000, () => {
  console.log('Server draait op http://localhost:3000');
});
