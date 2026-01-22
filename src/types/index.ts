export interface ConversationContext {
  contactPhone?: string;
  contactEmail?: string;
  contactName?: string;
  gardenSize?: string;
  hasPhotos: boolean;
  messageHistory: Array<{
    role: 'customer' | 'assistant';
    content: string;
  }>;
}

export interface AIResponse {
  message: string;
  collectedInfo?: {
    gardenSize?: string;
    email?: string;
    phone?: string;
    name?: string;
  };
  conversationComplete: boolean;
}
