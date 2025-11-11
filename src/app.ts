import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import config from './config/index.js';
import routes from './routes/index.js';
import ElasticsearchService from './services/elasticsearch/ElasticsearchService.js';
import VectorService from './services/ai/VectorService.js';
import IMAPService from './services/imap/IMAPService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Serve static files from public directory
    this.app.use(express.static(path.join(__dirname, '../public')));
    
    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api', routes);

    // Serve frontend
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // 404 handler - must be last
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error',
      });
    });
  }

  public async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing ReachInbox Onebox...\n');

      // Initialize Elasticsearch
      console.log('📊 Initializing Elasticsearch...');
      await ElasticsearchService.initialize();

      // Initialize Vector Database
      console.log('🧠 Initializing Vector Database...');
      await VectorService.initialize();

      // Initialize IMAP connections
      console.log('📧 Initializing IMAP connections...');
      await IMAPService.initializeAccounts();

      console.log('\n✅ All services initialized successfully!');
    } catch (error) {
      console.error('❌ Error initializing services:', error);
      throw error;
    }
  }

  public start(): void {
    this.app.listen(config.port, () => {
      console.log(`\n🎉 Server running on http://localhost:${config.port}`);
      console.log(`📡 API available at http://localhost:${config.port}/api`);
      console.log(`🌐 Frontend available at http://localhost:${config.port}`);
      console.log(`\n💡 Press Ctrl+C to stop the server\n`);
    });
  }

  public async shutdown(): Promise<void> {
    console.log('\n🛑 Shutting down gracefully...');
    await IMAPService.disconnect();
    console.log('✅ All connections closed');
    process.exit(0);
  }
}

export default App;