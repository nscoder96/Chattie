import { z } from 'zod';

const envSchema = z.object({
  // OpenAI
  OPENAI_API_KEY: z.string().min(1),

  // Twilio (WhatsApp) - optional, use Unipile instead
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // Unipile (WhatsApp) - preferred
  UNIPILE_API_KEY: z.string().optional(),
  UNIPILE_DSN: z.string().optional(), // e.g., "api1.unipile.com"
  UNIPILE_ACCOUNT_ID: z.string().optional(), // WhatsApp account ID

  // Gmail API (optional for now)
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),

  // Business owner
  BUSINESS_OWNER_EMAIL: z.string().email(),

  // Apify (optional - falls back to Cheerio scraper)
  APIFY_API_TOKEN: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1),

  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Response mode
  RESPONSE_MODE: z.enum(['approval', 'auto']).default('approval'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

export type Config = z.infer<typeof envSchema>;
