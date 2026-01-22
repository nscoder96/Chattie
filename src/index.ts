import 'dotenv/config';
import express from 'express';
import { config } from './config/index.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { gmailRouter, startEmailPolling } from './routes/gmail.js';
import { adminRouter } from './routes/admin.js';
import { prisma } from './services/database.js';

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/whatsapp', whatsappRouter);
app.use('/gmail', gmailRouter);
app.use('/admin', adminRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: config.RESPONSE_MODE,
    timestamp: new Date().toISOString(),
  });
});

// Start server
async function start() {
  try {
    // Connect to database
    await prisma.$connect();
    console.log('Database connected');

    // Start email polling only if Gmail is properly configured
    const gmailConfigured = config.GMAIL_CLIENT_ID &&
      config.GMAIL_REFRESH_TOKEN &&
      config.GMAIL_CLIENT_ID !== 'placeholder' &&
      config.GMAIL_REFRESH_TOKEN !== 'placeholder';

    if (gmailConfigured) {
      startEmailPolling(60000);
      console.log('Gmail polling enabled');
    } else {
      console.log('Gmail not configured - skipping email polling');
    }

    // Start HTTP server
    const port = parseInt(config.PORT, 10);
    app.listen(port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                       CHATTIE                              ║
║          AI-powered WhatsApp & Gmail Assistant             ║
╠════════════════════════════════════════════════════════════╣
║  Server running on port ${port.toString().padEnd(33)}║
║  Mode: ${config.RESPONSE_MODE.padEnd(50)}║
║                                                            ║
║  Endpoints:                                                ║
║  • WhatsApp webhook: POST /whatsapp/webhook                ║
║  • Gmail check:      POST /gmail/check                     ║
║  • Health:           GET  /health                          ║
║                                                            ║
║  Admin API:                                                ║
║  • GET  /admin/config     - Get business config            ║
║  • PUT  /admin/config     - Update business config         ║
║  • POST /admin/scrape     - Scrape website for context     ║
║  • GET  /admin/contacts   - List all contacts              ║
║  • GET  /admin/pending    - List pending approvals         ║
║  • GET  /admin/stats      - Dashboard statistics           ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

start();
