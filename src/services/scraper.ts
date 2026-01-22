import * as cheerio from 'cheerio';
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
  scrapedAt: string;
}

export async function scrapeWebsite(url: string): Promise<ScrapedWebsiteData> {
  const baseUrl = new URL(url).origin;
  const visited = new Set<string>();
  const pages: ScrapedWebsiteData['pages'] = [];

  // Scrape main page and find internal links
  const mainPage = await scrapePage(url);
  pages.push(mainPage);
  visited.add(url);

  // Find and scrape important subpages
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

  // Extract structured data from all pages
  const allContent = pages.map(p => p.content).join('\n');

  return {
    title: mainPage.title,
    description: extractDescription(pages[0].content),
    services: extractServices(allContent),
    about: extractAbout(allContent),
    contact: extractContact(allContent),
    pages,
    scrapedAt: new Date().toISOString(),
  };
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

  // Remove script, style, nav, footer elements
  $('script, style, nav, footer, header, aside, .cookie-banner, #cookie-banner').remove();

  // Get title
  const title = $('title').text().trim() || $('h1').first().text().trim() || '';

  // Get main content
  const content = $('main, article, .content, #content, .main, #main, body')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000); // Limit content size

  return { url, title, content };
}

function extractDescription(content: string): string {
  // Take first ~500 chars as description
  const cleaned = content.replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 500);
}

function extractServices(content: string): string[] {
  const services: string[] = [];
  const lowerContent = content.toLowerCase();

  // Common garden/landscaping services in Dutch
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

  // Look for "over ons" section
  const aboutMarkers = ['over ons', 'about us', 'wie zijn wij', 'ons bedrijf'];

  for (const marker of aboutMarkers) {
    const index = lowerContent.indexOf(marker);
    if (index !== -1) {
      // Extract ~500 chars after the marker
      return content.slice(index, index + 500).replace(/\s+/g, ' ').trim();
    }
  }

  return '';
}

function extractContact(content: string): ScrapedWebsiteData['contact'] {
  const contact: ScrapedWebsiteData['contact'] = {};

  // Email regex
  const emailMatch = content.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    contact.email = emailMatch[0];
  }

  // Dutch phone number regex (various formats)
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
  // For now, we use a single business config (first one)
  let config = await prisma.businessConfig.findFirst();

  if (!config) {
    // Create default config
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
