import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { scrapeWebsite, updateBusinessWithScrapedData, getBusinessConfig } from '../services/scraper.js';

export const adminRouter = Router();

// Get current business config
adminRouter.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await getBusinessConfig();
    res.json(config);
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// Update business config
const updateConfigSchema = z.object({
  businessName: z.string().min(1).optional(),
  businessDescription: z.string().optional(),
  websiteUrl: z.string().url().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  ownerEmail: z.string().email().optional(),
  ownerPhone: z.string().optional().nullable(),
  customInstructions: z.string().optional().nullable(),
  tone: z.enum(['friendly', 'professional', 'casual', 'formal']).optional().nullable(),
  language: z.enum(['nl', 'en']).optional(),
  collectFields: z.array(z.string()).optional(),
  responseMode: z.enum(['approval', 'auto']).optional(),
  greetingMessage: z.string().optional().nullable(),
  closingMessage: z.string().optional().nullable(),
});

adminRouter.put('/config', async (req: Request, res: Response) => {
  try {
    const data = updateConfigSchema.parse(req.body);
    const config = await getBusinessConfig();

    // Convert collectFields array to JSON string if provided
    const updateData: Record<string, unknown> = { ...data };
    if (data.collectFields) {
      updateData.collectFields = JSON.stringify(data.collectFields);
    }

    const updated = await prisma.businessConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
    } else {
      console.error('Error updating config:', error);
      res.status(500).json({ error: 'Failed to update config' });
    }
  }
});

// Scrape website
adminRouter.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const config = await getBusinessConfig();
    const scrapedData = await scrapeWebsite(url);

    await updateBusinessWithScrapedData(config.id, scrapedData);

    // Also update the website URL
    await prisma.businessConfig.update({
      where: { id: config.id },
      data: { websiteUrl: url },
    });

    res.json({
      success: true,
      data: scrapedData,
    });
  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ error: 'Failed to scrape website' });
  }
});

// Get all contacts
adminRouter.get('/contacts', async (_req: Request, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        conversations: {
          include: {
            _count: { select: { messages: true } },
          },
        },
      },
    });
    res.json(contacts);
  } catch (error) {
    console.error('Error getting contacts:', error);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// Get conversation details
adminRouter.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        pendingResponses: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json(conversation);
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Get pending responses (awaiting approval)
adminRouter.get('/pending', async (_req: Request, res: Response) => {
  try {
    const pending = await prisma.pendingResponse.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: {
          include: { contact: true },
        },
      },
    });
    res.json(pending);
  } catch (error) {
    console.error('Error getting pending responses:', error);
    res.status(500).json({ error: 'Failed to get pending responses' });
  }
});

// Dashboard stats
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [
      totalContacts,
      totalConversations,
      pendingResponses,
      todayMessages,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.conversation.count(),
      prisma.pendingResponse.count({ where: { status: 'PENDING' } }),
      prisma.message.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    res.json({
      totalContacts,
      totalConversations,
      pendingResponses,
      todayMessages,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});
