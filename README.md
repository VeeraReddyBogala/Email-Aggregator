# Emial Aggregator

AI-Powered Email Onebox with Real-Time IMAP Sync, Elasticsearch, and RAG

## Features

- 📧 Real-time IMAP email synchronization
- 🔍 Full-text search with Elasticsearch
- 🤖 AI-powered email categorization using Google Gemini
- 🧠 RAG (Retrieval-Augmented Generation) for intelligent replies
- 📊 REST API for email management

## Prerequisites

- Node.js 18+
- Docker and Docker Compose (for Elasticsearch)
- Google Gemini API key

## Quick Start

### 1. Clone and Install

```bash
npm install
```

### 2. Start Docker Services

```bash
npm run docker:up
```

This starts:

- Elasticsearch on port 9200

### 3. Configure Environment

Copy `.env.example` to `.env` and configure:

```env
 # Server
PORT=3000

# Email Accounts (JSON array)
EMAIL_ACCOUNTS=[
  {
    "id": "acc1",
    "email": "your-email@gmail.com",
    "password": "your-app-password",
    "imapHost": "imap.gmail.com",
    "imapPort": 993
  }
]

# AI (Gemini)
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
AI_API_KEY=your_gemini_api_key_here

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_INDEX=emails


# Optional App URL used in deep links
APP_BASE_URL=http://localhost:3000

```

### 4. Run Development Server

```bash
npm run dev
```

The server will start on http://localhost:3000

Notes:

- Initial sync is limited to the last 30 emails to avoid AI rate limits.
- New emails are processed in real time via IMAP IDLE.

## Email Account Configuration

### Gmail Setup

1. **Enable 2-Factor Authentication**
2. **Generate App Password**:
   - Go to Google Account → Security
   - Under "Signing in to Google", select "App passwords"
   - Generate a new app password for "Mail"
3. **Use the app password** (not your regular password) in the configuration

### Other Email Providers

Configure the appropriate IMAP settings:

- **Outlook/Hotmail**: `imap-mail.outlook.com:993`
- **Yahoo**: `imap.mail.yahoo.com:993`
- **Custom**: Use your provider's IMAP settings

## API Endpoints

### Emails

- `GET /api/emails` - Get all emails (paginated)
- `GET /api/emails/search?q=keyword` - Search emails
- `GET /api/emails/:id` - Get email by ID
- `POST /api/emails/:id/suggest-reply` - Generate AI-assisted suggested reply

### Accounts

- `GET /api/accounts` - List email accounts
- `GET /api/accounts/status` - Get IMAP connection status

### System

- `GET /api/health` - Health check
- `POST /api/webhooks/test` - Test webhook configuration

### Categorization Utilities (optional)

- `GET /api/emails/categorization/status` - Category counts
- `POST /api/emails/categorization/backfill?limit=50` - Categorize uncategorized emails in small batches

## Search Query Parameters

- `q` - Search query
- `account` - Filter by account ID
- `folder` - Filter by folder (e.g., INBOX)
- `category` - Filter by AI category (Interested, Not Interested, etc.)
- `from` - Pagination offset
- `size` - Results per page

## AI Categories

Emails are automatically categorized as:

- **Interested** - Shows interest in your product/service
- **Meeting Booked** - Scheduling or meeting requests
- **Not Interested** - Declines or no interest
- **Spam** - Promotional or spam
- **Out of Office** - Auto-replies
- **Uncategorized** - Other

## Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run build` - Build for production
- `npm start` - Run production server
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services
- `npm run docker:logs` - View Docker logs

## Project Structure

```
src/
├── config/           # Configuration management
├── controllers/      # Request handlers
├── routes/          # API routes
├── services/        # Business logic
│   ├── ai/         # AI and vector services
│   ├── elasticsearch/ # Search service
│   ├── imap/       # Email sync service
│   └── webhook/    # Webhook service
├── types/          # TypeScript type definitions
├── app.ts          # Express app setup
└── server.ts       # Server entry point
```

## Troubleshooting

### IMAP Connection Issues

- Verify email credentials
- Check IMAP settings for your provider
- Ensure 2FA and app passwords are set up correctly
- Check firewall/network settings

### Elasticsearch Issues

```powershell
# Check if Elasticsearch is running (PowerShell)
Invoke-RestMethod -Uri "http://localhost:9200"

# View Docker logs
npm run docker:logs
```

### Port Already in Use

```bash
# Change PORT in .env file
PORT=3001
```

## Development

### TypeScript

The project uses TypeScript with strict mode and ES modules.

### Hot Reload

tsx watch automatically reloads on file changes during development.

### Code Style

- ES Modules (`"type": "module"` in package.json; .js extensions in imports)
- Async/await for asynchronous operations
- Type-safe with strict TypeScript config (noUncheckedIndexedAccess, exactOptionalPropertyTypes)

## Author

Veera Reddy

