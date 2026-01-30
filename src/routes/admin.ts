import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { saveMessage } from '../services/database.js';
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

// Update scraped/categorized content (manual edits)
adminRouter.put('/scraped-content', async (req: Request, res: Response) => {
  try {
    const config = await getBusinessConfig();
    if (!config.scrapedContent) {
      res.status(400).json({ error: 'No scraped content to update. Scrape a website first.' });
      return;
    }

    const existing = JSON.parse(config.scrapedContent);
    const { categorized, description, services, about } = req.body;

    if (categorized) existing.categorized = categorized;
    if (description !== undefined) existing.description = description;
    if (services !== undefined) existing.services = services;
    if (about !== undefined) existing.about = about;

    await prisma.businessConfig.update({
      where: { id: config.id },
      data: { scrapedContent: JSON.stringify(existing) },
    });

    res.json({ success: true, data: existing });
  } catch (error) {
    console.error('Error updating scraped content:', error);
    res.status(500).json({ error: 'Failed to update scraped content' });
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

// List conversations (MUST be before :id route)
adminRouter.get('/conversations', async (req: Request, res: Response) => {
  try {
    const { status, channel } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;
    if (channel) where.channel = channel as string;

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        contact: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const result = conversations.map(conv => ({
      ...conv,
      messageCount: conv._count.messages,
      lastMessage: conv.messages[0] || null,
      messages: undefined,
      _count: undefined,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
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

// Approve a pending response
adminRouter.post('/pending/:id/approve', async (req: Request, res: Response) => {
  try {
    const { modifiedMessage } = req.body;
    const pending = await prisma.pendingResponse.findUnique({
      where: { id: req.params.id },
      include: {
        conversation: {
          include: { contact: true },
        },
      },
    });

    if (!pending) {
      res.status(404).json({ error: 'Pending response not found' });
      return;
    }

    const messageToSend = modifiedMessage || pending.suggestedResponse;
    const contact = pending.conversation.contact;

    // Send via appropriate channel
    if (pending.conversation.channel === 'WHATSAPP' && contact.phone) {
      await sendWhatsAppMessage(contact.phone, messageToSend);
    }

    await saveMessage(pending.conversationId, contact.id, 'OUTBOUND', messageToSend);

    const status = modifiedMessage ? 'MODIFIED' : 'APPROVED';
    await prisma.pendingResponse.update({
      where: { id: req.params.id },
      data: { status, respondedAt: new Date() },
    });

    res.json({ success: true, status, messageSent: messageToSend });
  } catch (error) {
    console.error('Error approving response:', error);
    res.status(500).json({ error: 'Failed to approve response' });
  }
});

// Reject a pending response
adminRouter.post('/pending/:id/reject', async (req: Request, res: Response) => {
  try {
    const pending = await prisma.pendingResponse.findUnique({
      where: { id: req.params.id },
    });

    if (!pending) {
      res.status(404).json({ error: 'Pending response not found' });
      return;
    }

    await prisma.pendingResponse.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });

    res.json({ success: true, status: 'REJECTED' });
  } catch (error) {
    console.error('Error rejecting response:', error);
    res.status(500).json({ error: 'Failed to reject response' });
  }
});

// Dashboard stats
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [
      totalContacts,
      totalConversations,
      pendingResponses,
      todayMessages,
      recentMessages,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.conversation.count(),
      prisma.pendingResponse.count({ where: { status: 'PENDING' } }),
      prisma.message.count({
        where: { createdAt: { gte: todayStart } },
      }),
      // Get recent messages for dashboard feed
      prisma.message.findMany({
        where: { createdAt: { gte: todayStart } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          contact: { select: { name: true, phone: true, email: true } },
          conversation: { select: { id: true, channel: true } },
        },
      }),
    ]);

    res.json({
      totalContacts,
      totalConversations,
      pendingResponses,
      todayMessages,
      recentMessages,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Send a manual WhatsApp message
adminRouter.post('/send', async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      res.status(400).json({ error: 'phone and message are required' });
      return;
    }

    // Send the message
    const sid = await sendWhatsAppMessage(phone, message);

    // Save to database if contact exists
    const contact = await prisma.contact.findUnique({ where: { phone } });
    if (contact) {
      const conversation = await prisma.conversation.findFirst({
        where: { contactId: contact.id, channel: 'WHATSAPP', status: { in: ['ACTIVE', 'PAUSED'] } },
      });
      if (conversation) {
        await saveMessage(conversation.id, contact.id, 'OUTBOUND', message);
      }
    }

    res.json({ success: true, sid });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Pause bot for a conversation (owner takes over)
adminRouter.post('/conversations/:id/pause', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status: 'PAUSED' },
      include: { contact: true },
    });

    res.json({ success: true, message: `Bot gepauzeerd voor ${conversation.contact.name || conversation.contact.phone}`, conversation });
  } catch (error) {
    console.error('Error pausing conversation:', error);
    res.status(500).json({ error: 'Failed to pause conversation' });
  }
});

// Mark conversation for follow-up (owner tried calling, no answer)
adminRouter.post('/conversations/:id/follow-up', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { contact: true },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const newCount = conversation.followUpCount + 1;
    // Schedule next follow-up in 2 days, or mark complete after 3
    const nextFollowUp = newCount < 3 ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) : null;

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: {
        followUpCount: newCount,
        lastFollowUpAt: new Date(),
        nextFollowUpAt: nextFollowUp,
        needsFollowUp: newCount < 3,
        status: newCount >= 3 ? 'COMPLETED' : conversation.status,
      },
      include: { contact: true },
    });

    res.json({
      success: true,
      followUpCount: newCount,
      message: newCount >= 3
        ? `Laatste follow-up (${newCount}/3). Gesprek afgesloten.`
        : `Follow-up ${newCount}/3 gemarkeerd. Volgende follow-up over 2 dagen.`,
      conversation: updated,
    });
  } catch (error) {
    console.error('Error marking follow-up:', error);
    res.status(500).json({ error: 'Failed to mark follow-up' });
  }
});

// Resume bot for a conversation
adminRouter.post('/conversations/:id/resume', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
      include: { contact: true },
    });

    res.json({ success: true, message: `Bot hervat voor ${conversation.contact.name || conversation.contact.phone}`, conversation });
  } catch (error) {
    console.error('Error resuming conversation:', error);
    res.status(500).json({ error: 'Failed to resume conversation' });
  }
});

// Reset a contact's conversation (delete all messages, start fresh)
adminRouter.post('/reset-contact', async (req: Request, res: Response) => {
  try {
    let phone = req.body.phone;
    if (!phone) {
      res.status(400).json({ error: 'phone is required' });
      return;
    }

    // Normalize phone number (add + if missing)
    if (!phone.startsWith('+')) {
      phone = '+31' + phone.replace(/^0/, '');
    }

    const contact = await prisma.contact.findUnique({ where: { phone } });
    if (!contact) {
      res.status(404).json({ error: 'Contact niet gevonden' });
      return;
    }

    // Delete all messages and conversations for this contact
    await prisma.message.deleteMany({ where: { contactId: contact.id } });
    await prisma.pendingResponse.deleteMany({
      where: { conversation: { contactId: contact.id } },
    });
    await prisma.conversation.deleteMany({ where: { contactId: contact.id } });

    // Reset contact fields
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        name: null,
        email: null,
        gardenSize: null,
        gardenPhotos: null,
      },
    });

    res.json({ success: true, message: `Gesprek gereset voor ${phone}` });
  } catch (error) {
    console.error('Error resetting contact:', error);
    res.status(500).json({ error: 'Failed to reset contact' });
  }
});
