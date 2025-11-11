import { Router } from 'express';
import type { Request, Response } from 'express';
import EmailController from '../controllers/EmailController.js';
import WebhookService from '../services/webhook/WebhookService.js';

const router = Router();

// Email routes
router.get('/emails', (req: Request, res: Response) => EmailController.getAllEmails(req, res));
router.get('/emails/search', (req: Request, res: Response) => EmailController.searchEmails(req, res));
router.get('/emails/:id', (req: Request, res: Response) => EmailController.getEmailById(req, res));
router.post('/emails/:id/suggest-reply', (req: Request, res: Response) => EmailController.suggestReply(req, res));
router.get('/emails/categorization/status', (req: Request, res: Response) => EmailController.getCategorizationStatus(req, res));
router.post('/emails/categorization/backfill', (req: Request, res: Response) => EmailController.backfillCategorization(req, res));

// Account routes
router.get('/accounts', (req: Request, res: Response) => EmailController.getAccounts(req, res));
router.get('/accounts/status', (req: Request, res: Response) => EmailController.getConnectionStatus(req, res));

// Webhook routes
router.post('/webhooks/test', async (req: Request, res: Response) => {
  try {
    const results = await WebhookService.testWebhooks();
    res.json({
      success: true,
      results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check
router.get('/health', (req: Request, res: Response) => EmailController.healthCheck(req, res));

export default router;
