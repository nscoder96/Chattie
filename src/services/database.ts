import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function findOrCreateContact(phone: string, name?: string) {
  return prisma.contact.upsert({
    where: { phone },
    update: { name: name || undefined },
    create: { phone, name },
  });
}

export async function getOrCreateConversation(contactId: string, channel: 'WHATSAPP' | 'EMAIL') {
  // Find active conversation or create new one
  const existing = await prisma.conversation.findFirst({
    where: {
      contactId,
      channel,
      status: 'ACTIVE',
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 20, // Last 20 messages for context
      },
    },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      contactId,
      channel,
    },
    include: {
      messages: true,
    },
  });
}

export async function saveMessage(
  conversationId: string,
  contactId: string,
  direction: 'INBOUND' | 'OUTBOUND',
  content: string,
  whatsappMessageId?: string
) {
  return prisma.message.create({
    data: {
      conversationId,
      contactId,
      direction,
      content,
      whatsappMessageId,
    },
  });
}

export async function createPendingResponse(
  conversationId: string,
  originalMessage: string,
  suggestedResponse: string
) {
  return prisma.pendingResponse.create({
    data: {
      conversationId,
      originalMessage,
      suggestedResponse,
    },
  });
}

export async function updatePendingResponse(
  id: string,
  status: 'PENDING' | 'APPROVED' | 'MODIFIED' | 'REJECTED',
  approvalEmailId?: string
) {
  return prisma.pendingResponse.update({
    where: { id },
    data: {
      status,
      approvalEmailId,
      respondedAt: status !== 'PENDING' ? new Date() : undefined,
    },
  });
}

export async function findPendingResponseByEmailId(approvalEmailId: string) {
  return prisma.pendingResponse.findFirst({
    where: { approvalEmailId },
    include: {
      conversation: {
        include: {
          contact: true,
        },
      },
    },
  });
}

export async function updateContactInfo(
  contactId: string,
  info: {
    email?: string;
    name?: string;
    gardenSize?: string;
    gardenPhotos?: string;
  }
) {
  return prisma.contact.update({
    where: { id: contactId },
    data: info,
  });
}

export async function getConversationHistory(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
}
