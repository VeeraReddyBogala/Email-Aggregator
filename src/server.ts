import App from './app.js';

const app = new App();

// Initialize and start the server
async function bootstrap() {
  try {
    await app.initialize();
    app.start();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await app.shutdown();
});

process.on('SIGTERM', async () => {
  await app.shutdown();
});

// Start the application
bootstrap();
