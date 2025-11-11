import type { Request, Response } from 'express';
import ElasticsearchService from '../services/elasticsearch/ElasticsearchService.js';
import VectorService from '../services/ai/VectorService.js';
import AIService from '../services/ai/AIService.js';
import IMAPService from '../services/imap/IMAPService.js';
import type { SearchQuery, SuggestedReply } from '../types/index.js';
import config from '../config/index.js';

export class EmailController {
  async getAllEmails(req: Request, res: Response): Promise<void> {
    try {
      const from = parseInt(req.query.from as string) || 0;
      const size = parseInt(req.query.size as string) || 100;

      const query: SearchQuery = { from, size };
      const emails = await ElasticsearchService.searchEmails(query);

      res.json({
        success: true,
        count: emails.length,
        emails,
      });
    } catch (error: any) {
      console.error('Error getting all emails:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async searchEmails(req: Request, res: Response): Promise<void> {
    try {
      const query: SearchQuery = {
        q: req.query.q as string,
        account: req.query.account as string,
        folder: req.query.folder as string,
        category: req.query.category as any,
        from: parseInt(req.query.from as string) || 0,
        size: parseInt(req.query.size as string) || 20,
      };

      const emails = await ElasticsearchService.searchEmails(query);

      res.json({
        success: true,
        total: emails.length,
        count: emails.length,
        emails,
        query,
      });
    } catch (error: any) {
      console.error('Error searching emails:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getEmailById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Email ID is required',
        });
        return;
      }

      const email = await ElasticsearchService.getEmailById(id);

      if (!email) {
        res.status(404).json({
          success: false,
          error: 'Email not found',
        });
        return;
      }

      res.json({
        success: true,
        email,
      });
    } catch (error: any) {
      console.error('Error getting email by ID:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async suggestReply(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Email ID is required',
        });
        return;
      }
      
      // Get the email
      const email = await ElasticsearchService.getEmailById(id);
      
      if (!email) {
        res.status(404).json({
          success: false,
          error: 'Email not found',
        });
        return;
      }

      // Create query from email content
      const queryText = `${email.subject} ${email.body}`;

      // Retrieve relevant context from vector database
      const contexts = await VectorService.searchSimilarContext(queryText, 3);

      // Generate reply using RAG
      const reply = await AIService.generateReply(
        `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`,
        contexts
      );

      const suggestedReply: SuggestedReply = {
        reply,
        context: contexts,
        confidence: 0.85,
      };

      res.json({
        success: true,
        emailId: id,
        suggestedReply,
      });
    } catch (error: any) {
      console.error('Error generating suggested reply:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getAccounts(req: Request, res: Response): Promise<void> {
    try {
      const accounts = config.emailAccounts.map(acc => ({
        id: acc.id,
        email: acc.email,
        imapHost: acc.imapHost,
      }));

      res.json({
        success: true,
        accounts,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getConnectionStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = IMAPService.getConnectionStatus();

      res.json({
        success: true,
        connections: status,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const esHealthy = await ElasticsearchService.ping();
      const qdrantHealthy = await VectorService.healthCheck();
      const imapStatus = IMAPService.getConnectionStatus();

      res.json({
        success: true,
        services: {
          elasticsearch: esHealthy ? 'healthy' : 'unhealthy',
          qdrant: qdrantHealthy ? 'healthy' : 'unhealthy',
          imap: {
            total: imapStatus.length,
            connected: imapStatus.filter((s) => s.connected).length,
            details: imapStatus,
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // GET /emails/categorization/status
  async getCategorizationStatus(req: Request, res: Response): Promise<void> {
    try {
      const stats = await ElasticsearchService.getCategoryStats();
      const categorized = Object.entries(stats.byCategory)
        .filter(([k]) => k && k !== 'Uncategorized')
        .reduce((sum, [, v]) => sum + v, 0);

      res.json({
        success: true,
        total: stats.total,
        categorized,
        uncategorized: stats.total - categorized,
        byCategory: stats.byCategory,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /emails/categorization/backfill?limit=50
  async backfillCategorization(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const batch = await ElasticsearchService.findUncategorized(limit);

      let success = 0;
      let failed = 0;

      for (const email of batch) {
        try {
          const cat = await AIService.categorizeEmail({
            subject: email.subject,
            body: email.body || '',
            from: email.from,
          });
          await ElasticsearchService.updateEmailCategory(email.id, cat.category);
          success++;
        } catch (e) {
          failed++;
        }
      }

      res.json({
        success: true,
        processed: batch.length,
        categorized: success,
        failed,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new EmailController();