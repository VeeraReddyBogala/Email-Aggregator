import dotenv from 'dotenv';
import type { EmailAccount } from '../types/index.js';

dotenv.config();

export interface Config {
  port: number;
  emailAccounts: EmailAccount[];
  elasticsearch: {
    node: string;
    indexName: string;
  };
  imap: {
    syncDays: number;
    idleTimeout: number;
    maxReconnectAttempts: number;
    reconnectDelay: number;
  };
  ai: {
    provider: 'gemini' | 'openai';
    apiKey: string;
    model: string;
  };
  webhooks: {
    interestedUrls: string[];
    slack?: string | undefined;
    generic?: string | undefined;
  };
  qdrant?: {
    url: string;
    apiKey?: string | undefined;
    collectionName: string;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  emailAccounts: JSON.parse(process.env.EMAIL_ACCOUNTS || '[]'),
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    indexName: process.env.ELASTICSEARCH_INDEX || 'emails',
  },
  imap: {
    syncDays: parseInt(process.env.IMAP_SYNC_DAYS || '30', 10),
    idleTimeout: parseInt(process.env.IMAP_IDLE_TIMEOUT || '1740000', 10), // 29 minutes
    maxReconnectAttempts: parseInt(process.env.IMAP_MAX_RECONNECT_ATTEMPTS || '10', 10),
    reconnectDelay: parseInt(process.env.IMAP_RECONNECT_DELAY || '5000', 10),
  },
  ai: {
    provider: (process.env.AI_PROVIDER as 'gemini' | 'openai') || 'gemini',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gemini-1.5-flash',
  },
  webhooks: {
    interestedUrls: process.env.WEBHOOK_INTERESTED_URLS?.split(',') || [],
    ...(process.env.WEBHOOK_SLACK_URL && { slack: process.env.WEBHOOK_SLACK_URL }),
    ...(process.env.WEBHOOK_GENERIC_URL && { generic: process.env.WEBHOOK_GENERIC_URL }),
  },
  ...(process.env.QDRANT_URL && {
    qdrant: {
      url: process.env.QDRANT_URL,
      ...(process.env.QDRANT_API_KEY && { apiKey: process.env.QDRANT_API_KEY }),
      collectionName: process.env.QDRANT_COLLECTION || 'product_context',
    },
  }),
};

export default config;
