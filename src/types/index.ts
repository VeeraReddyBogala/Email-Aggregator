// Core Types and Interfaces

export interface EmailAccount {
  id: string;
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
}

export type AICategory = 
  | 'Interested' 
  | 'Meeting Booked' 
  | 'Not Interested' 
  | 'Spam' 
  | 'Out of Office' 
  | 'Uncategorized';

export interface EmailDocument {
  id: string;
  accountId: string;
  folder: string;
  subject: string;
  body: string;
  htmlBody?: string;
  from: string;
  to: string[];
  cc?: string[];
  date: Date;
  aiCategory: AICategory;
  indexedAt: Date;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}

export interface SearchQuery {
  q?: string;
  account?: string;
  folder?: string;
  category?: AICategory;
  from?: number;
  size?: number;
}

export interface AICategorizationResponse {
  category: AICategory;
  confidence?: number;
}

export interface SuggestedReply {
  reply: string;
  context: string[];
  confidence: number;
}

export interface ProductContext {
  id: string;
  content: string;
  metadata: {
    type: string;
    priority: number;
  };
}

export interface WebhookPayload {
  event: string;
  email: EmailDocument;
  timestamp: Date;
}

export interface IMAPConnectionStatus {
  accountId: string;
  connected: boolean;
  lastSync: Date;
  error?: string;
}