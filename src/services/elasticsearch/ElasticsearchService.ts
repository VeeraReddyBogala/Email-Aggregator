import { Client } from '@elastic/elasticsearch';
import type { EmailDocument, SearchQuery, AICategory } from '../../types/index.js';
import config from '../../config/index.js';

export class ElasticsearchService {
  private client: Client;
  private indexName: string;

  constructor() {
    this.client = new Client({ node: config.elasticsearch.node });
    this.indexName = config.elasticsearch.indexName;
  }

  async initialize(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: this.indexName });
      
      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              accountId: { type: 'keyword' },
              folder: { type: 'keyword' },
              subject: { type: 'text' },
              body: { type: 'text' },
              htmlBody: { type: 'text' },
              from: { type: 'keyword' },
              to: { type: 'keyword' },
              cc: { type: 'keyword' },
              date: { type: 'date' },
              aiCategory: { type: 'keyword' },
              indexedAt: { type: 'date' },
              messageId: { type: 'keyword' },
              inReplyTo: { type: 'keyword' },
              references: { type: 'keyword' },
            },
          },
        });
        console.log(`✅ Created Elasticsearch index: ${this.indexName}`);
      } else {
        console.log(`✅ Elasticsearch index exists: ${this.indexName}`);
      }
    } catch (error) {
      console.error('❌ Error initializing Elasticsearch:', error);
      throw error;
    }
  }

  async indexEmail(email: EmailDocument): Promise<void> {
    try {
      await this.client.index({
        index: this.indexName,
        id: email.id,
        document: email,
      });
    } catch (error) {
      console.error('❌ Error indexing email:', error);
      throw error;
    }
  }

  async updateEmailCategory(emailId: string, category: AICategory): Promise<void> {
    try {
      await this.client.update({
        index: this.indexName,
        id: emailId,
        doc: { aiCategory: category },
      });
    } catch (error) {
      console.error('❌ Error updating email category:', error);
      throw error;
    }
  }

  // Find an email by RFC822 Message-ID. Returns ES id and source if found, else null.
  async findByMessageId(messageId: string): Promise<{ id: string; source: EmailDocument } | null> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        size: 1,
        query: {
          term: { messageId: messageId },
        },
      } as any);

      const hit = (response as any).hits?.hits?.[0];
      if (hit) {
        return { id: hit._id as string, source: hit._source as EmailDocument };
      }
      return null;
    } catch (error) {
      console.error('❌ Error searching by messageId:', error);
      return null;
    }
  }

  async existsByMessageId(messageId: string): Promise<boolean> {
    const found = await this.findByMessageId(messageId);
    return !!found;
  }

  async updateEmailFields(emailId: string, patch: Partial<EmailDocument>): Promise<void> {
    try {
      await this.client.update({
        index: this.indexName,
        id: emailId,
        doc: patch as any,
      });
    } catch (error) {
      console.error('❌ Error updating email fields:', error);
      throw error;
    }
  }

  async searchEmails(query: SearchQuery): Promise<EmailDocument[]> {
    try {
      const must: any[] = [];

      if (query.q) {
        must.push({
          multi_match: {
            query: query.q,
            fields: ['subject^2', 'body', 'from'],
          },
        });
      }

      if (query.account) {
        must.push({ term: { accountId: query.account } });
      }

      if (query.folder) {
        must.push({ term: { folder: query.folder } });
      }

      if (query.category) {
        must.push({ term: { aiCategory: query.category } });
      }

      const searchParams: any = {
        index: this.indexName,
        from: query.from || 0,
        size: query.size || 50,
        sort: [{ date: { order: 'desc' as const } }],
      };

      if (must.length > 0) {
        searchParams.query = { bool: { must } };
      } else {
        searchParams.query = { match_all: {} };
      }

      const response = await this.client.search(searchParams);

      return response.hits.hits.map((hit: any) => hit._source as EmailDocument);
    } catch (error) {
      console.error('❌ Error searching emails:', error);
      throw error;
    }
  }

  async getCategoryStats(): Promise<{ total: number; byCategory: Record<string, number> }> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        size: 0,
        aggs: {
          categories: {
            terms: { field: 'aiCategory', size: 20 },
          },
        },
      } as any);

      const total = (response as any).hits?.total?.value ?? 0;
      const buckets = (response as any).aggregations?.categories?.buckets ?? [];
      const byCategory: Record<string, number> = {};
      for (const b of buckets) {
        byCategory[b.key as string] = b.doc_count as number;
      }
      return { total, byCategory };
    } catch (error) {
      console.error('❌ Error getting category stats:', error);
      return { total: 0, byCategory: {} };
    }
  }

  async findUncategorized(limit = 50): Promise<EmailDocument[]> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        size: limit,
        query: {
          term: { aiCategory: 'Uncategorized' },
        },
        sort: [{ date: { order: 'desc' as const } }],
      } as any);

  return (response as any).hits?.hits?.map((h: any) => ({ ...(h._source as EmailDocument) })) ?? [];
    } catch (error) {
      console.error('❌ Error finding uncategorized emails:', error);
      return [];
    }
  }

  async getEmailById(emailId: string): Promise<EmailDocument | null> {
    try {
      const response = await this.client.get({
        index: this.indexName,
        id: emailId,
      });
      return response._source as EmailDocument;
    } catch (error) {
      console.error('❌ Error getting email by ID:', error);
      return null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('❌ Elasticsearch ping failed:', error);
      return false;
    }
  }
}

export default new ElasticsearchService();
