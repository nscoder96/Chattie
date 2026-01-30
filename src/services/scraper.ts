import * as cheerio from 'cheerio';
import { ApifyClient } from 'apify-client';
import OpenAI from 'openai';
import { config } from '../config/index.js';
import { prisma } from './database.js';

export interface ScrapedWebsiteData {
  title: string;
  description: string;
  services: string[];
  about: string;
  contact: {
    email?: string;
    phone?: string;
    address?: string;
  };
  pages: Array<{
    url: string;
    title: string;
    content: string;
  }>;
  categorized?: CategorizedContent;
  scrapedAt: string;
}

export interface CategorizedContent {
  diensten: Array<{ naam: string; beschrijving: string }>;
  prijsindicaties: string | null;
  werkgebied: string[];
  veelgestelde_vragen: Array<{ vraag: string; antwoord: string }>;
  over_het_bedrijf: string;
  contactinfo: { adres?: string; telefoon?: string; email?: string; openingstijden?: string };
  projecten: string[];
}

export async function scrapeWebsite(url: string): Promise<ScrapedWebsiteData> {
  if (config.APIFY_API_TOKEN) {
    return scrapeWithApify(url);
  }
  return scrapeWithCheerio(url);
}

// Apify Website Content Crawler
async function scrapeWithApify(url: string): Promise<ScrapedWebsiteData> {
  const client = new ApifyClient({ token: config.APIFY_API_TOKEN });

  console.log(`Scraping ${url} with Apify...`);

  const { defaultDatasetId } = await client.actor('apify/website-content-crawler').call({
    startUrls: [{ url }],
    maxCrawlPages: 20,
    crawlerType: 'cheerio',
  });

  const { items } = await client.dataset(defaultDatasetId).listItems();

  const pages = items.map((item: Record<string, unknown>) => ({
    url: (item.url as string) || '',
    title: ((item.metadata as Record<string, unknown>)?.title as string) || '',
    content: ((item.text as string) || '').slice(0, 10000),
  }));

  const allContent = pages.map(p => p.content).join('\n');
  const mainTitle = pages[0]?.title || '';

  const result: ScrapedWebsiteData = {
    title: mainTitle,
    description: pages[0]?.content?.slice(0, 500) || '',
    services: extractServices(allContent),
    about: extractAbout(allContent),
    contact: extractContact(allContent),
    pages,
    scrapedAt: new Date().toISOString(),
  };

  // Categorize content with GPT-4
  try {
    result.categorized = await categorizeContent(pages);
    console.log('Content categorized successfully');
  } catch (error) {
    console.error('Failed to categorize content:', error);
  }

  return result;
}

// Original Cheerio scraper (fallback)
async function scrapeWithCheerio(url: string): Promise<ScrapedWebsiteData> {
  const baseUrl = new URL(url).origin;
  const visited = new Set<string>();
  const pages: ScrapedWebsiteData['pages'] = [];

  const mainPage = await scrapePage(url);
  pages.push(mainPage);
  visited.add(url);

  const importantPaths = [
    '/over-ons', '/about', '/about-us',
    '/diensten', '/services',
    '/contact',
    '/prijzen', '/prices', '/pricing',
  ];

  for (const path of importantPaths) {
    const pageUrl = `${baseUrl}${path}`;
    if (!visited.has(pageUrl)) {
      try {
        const page = await scrapePage(pageUrl);
        if (page.content.length > 100) {
          pages.push(page);
          visited.add(pageUrl);
        }
      } catch {
        // Page doesn't exist, skip
      }
    }
  }

  const allContent = pages.map(p => p.content).join('\n');

  const result: ScrapedWebsiteData = {
    title: mainPage.title,
    description: extractDescription(pages[0].content),
    services: extractServices(allContent),
    about: extractAbout(allContent),
    contact: extractContact(allContent),
    pages,
    scrapedAt: new Date().toISOString(),
  };

  // Categorize content with GPT-4
  try {
    result.categorized = await categorizeContent(pages);
    console.log('Content categorized successfully');
  } catch (error) {
    console.error('Failed to categorize content:', error);
  }

  return result;
}

// GPT-4 Content Categorization
async function categorizeContent(
  rawPages: Array<{ url: string; title: string; content: string }>
): Promise<CategorizedContent> {
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

  const pagesText = rawPages
    .map(p => `## ${p.title} (${p.url})\n${p.content.slice(0, 3000)}`)
    .join('\n\n')
    .slice(0, 15000);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `Categoriseer de volgende website-inhoud in deze categorieën. Geef output als JSON:
{
  "diensten": [{"naam": "...", "beschrijving": "..."}],
  "prijsindicaties": "..." of null,
  "werkgebied": ["regio1", "regio2"],
  "veelgestelde_vragen": [{"vraag": "...", "antwoord": "..."}],
  "over_het_bedrijf": "...",
  "contactinfo": {"adres": "...", "telefoon": "...", "email": "...", "openingstijden": "..."},
  "projecten": ["beschrijving1", "beschrijving2"]
}

Extraheer alleen wat daadwerkelijk op de website staat. Laat velden leeg als de info niet beschikbaar is.`,
      },
      {
        role: 'user',
        content: pagesText,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2000,
  });

  const responseText = completion.choices[0]?.message?.content;
  if (!responseText) {
    throw new Error('No response from OpenAI for categorization');
  }

  return JSON.parse(responseText) as CategorizedContent;
}

async function scrapePage(url: string): Promise<{ url: string; title: string; content: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Chattie/1.0; +https://chattie.app)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header, aside, .cookie-banner, #cookie-banner').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim() || '';
  const content = $('main, article, .content, #content, .main, #main, body')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);

  return { url, title, content };
}

function extractDescription(content: string): string {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 500);
}

function extractServices(content: string): string[] {
  const services: string[] = [];
  const lowerContent = content.toLowerCase();

  const serviceKeywords = [
    'tuinonderhoud', 'tuinaanleg', 'snoeien', 'grasmaaien',
    'bestrating', 'schutting', 'hekwerk', 'vijver',
    'beplanting', 'gazon', 'terras', 'overkapping',
    'boomverzorging', 'onkruidbestrijding', 'bladruimen',
  ];

  for (const keyword of serviceKeywords) {
    if (lowerContent.includes(keyword)) {
      services.push(keyword);
    }
  }

  return services;
}

function extractAbout(content: string): string {
  const lowerContent = content.toLowerCase();
  const aboutMarkers = ['over ons', 'about us', 'wie zijn wij', 'ons bedrijf'];

  for (const marker of aboutMarkers) {
    const index = lowerContent.indexOf(marker);
    if (index !== -1) {
      return content.slice(index, index + 500).replace(/\s+/g, ' ').trim();
    }
  }

  return '';
}

function extractContact(content: string): ScrapedWebsiteData['contact'] {
  const contact: ScrapedWebsiteData['contact'] = {};

  const emailMatch = content.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    contact.email = emailMatch[0];
  }

  const phoneMatch = content.match(/(?:0|\+31|0031)[\s.-]?[1-9](?:[\s.-]?\d){8}/);
  if (phoneMatch) {
    contact.phone = phoneMatch[0].replace(/[\s.-]/g, '');
  }

  return contact;
}

// Save scraped data to business config
export async function updateBusinessWithScrapedData(
  businessConfigId: string,
  scrapedData: ScrapedWebsiteData
): Promise<void> {
  await prisma.businessConfig.update({
    where: { id: businessConfigId },
    data: {
      scrapedContent: JSON.stringify(scrapedData),
      scrapedAt: new Date(),
      businessDescription: scrapedData.description || undefined,
    },
  });
}

// Get or create business config
export async function getBusinessConfig() {
  let config = await prisma.businessConfig.findFirst();

  if (!config) {
    config = await prisma.businessConfig.create({
      data: {
        businessName: 'Mijn Bedrijf',
        ownerEmail: 'owner@example.com',
        customInstructions: '',
      },
    });
  }

  return config;
}
