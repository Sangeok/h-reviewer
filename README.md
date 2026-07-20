# hreviewer

*Read this in other languages: [English](README.md), [한국어](README.ko.md)*

AI-powered GitHub code review platform that provides intelligent, automated code analysis and review recommendations.

## 🚀 Features

- **AI-Powered Code Reviews** - Automated code analysis using Google AI and RAG (Retrieval-Augmented Generation)
- **GitHub Integration** - Seamless OAuth authentication and repository synchronization
- **Vector Search** - Intelligent codebase indexing using Pinecone for context-aware reviews
- **Background Processing** - Async review generation with Inngest for optimal performance
- **Real-time Webhooks** - Automatic review triggers on push events and pull requests
- **Usage Tracking** - Built-in quota management and subscription tier support
- **Modern UI** - Responsive design with Tailwind CSS v4 and Radix UI components

## 🛠️ Tech Stack

### Core Framework
- **Next.js 16** (App Router) - React-based full-stack framework
- **React 19** - Latest React with Server Components
- **TypeScript** - Strict mode enabled for type safety

### Database & ORM
- **PostgreSQL** - Primary database
- **Prisma** - Type-safe ORM with custom client location (`lib/generated/prisma/`)
- **@prisma/adapter-pg** - Native PostgreSQL adapter

### Authentication
- **Better-Auth** - Modern authentication with Prisma adapter
- **GitHub OAuth** - Social login with repository access scope

### AI & Vector Search
- **Google AI SDK** - Embedding generation and AI analysis
- **Pinecone** - Vector database for semantic code search
- **RAG Pipeline** - Retrieval-Augmented Generation for context-aware reviews

### Background Jobs
- **Inngest** - Async job processing for code review generation

### GitHub Integration
- **Octokit** - Official GitHub API client
- **Webhooks** - Real-time repository event handling

### Styling & UI
- **Tailwind CSS v4** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives
- **next-themes** - Dark mode support
- **Lucide Icons** - Modern icon library

### State Management
- **TanStack Query v5** - Server state synchronization and caching

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 20.x or higher
- **npm** or **yarn** or **pnpm**
- **PostgreSQL** 14.x or higher
- **Git**

You'll also need accounts for:
- **GitHub** (for OAuth and API access)
- **Pinecone** (vector database)
- **Google AI** (Generative AI API)

## 🔧 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/hreviewer.git
cd hreviewer
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hreviewer"

# Better-Auth
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="your-secret-key-min-32-chars"

# GitHub OAuth
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"

# AI Services
GOOGLE_GENERATIVE_AI_API_KEY="your_google_ai_api_key"
PINECONE_DB_API_KEY="your_pinecone_api_key"

# Optional: Inngest (for background jobs)
INNGEST_EVENT_KEY="your_inngest_event_key"
INNGEST_SIGNING_KEY="your_inngest_signing_key"
```

### 4. Database Setup

#### Generate Prisma Client

```bash
npx prisma generate
```

#### Run Database Migrations

```bash
npx prisma migrate dev
```

#### (Optional) Seed Database

```bash
npx prisma db seed
```

#### Open Prisma Studio (Database GUI)

```bash
npx prisma studio
```

### 5. GitHub OAuth Configuration

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set **Homepage URL**: `http://localhost:3000`
4. Set **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
5. Copy **Client ID** and **Client Secret** to your `.env` file
6. **IMPORTANT**: Request `repo` scope for repository access

### 6. Pinecone Setup

1. Create account at [Pinecone](https://www.pinecone.io/)
2. Create a new index named `hreviewer`
3. Set dimension: `768` (Google AI embedding dimension)
4. Copy API key to `.env` as `PINECONE_DB_API_KEY`

### 7. Google AI Setup

1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Copy to `.env` as `GOOGLE_GENERATIVE_AI_API_KEY`

## 🚀 Development

### Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Start Inngest Dev Server (for background jobs)

In a separate terminal:

```bash
npm run inngest-dev
```

This starts the Inngest development UI at [http://localhost:8288](http://localhost:8288).

### Run Linter

```bash
npm run lint
```

## 🔗 GitHub Webhook Setup (Optional)

For local development with webhooks:

### 1. Expose Local Server with ngrok

```bash
npm run ngrok
```

This will give you a public URL (e.g., `https://abc123.ngrok.io`).

### 2. Configure GitHub Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL**: `https://abc123.ngrok.io/api/webhooks/github`
3. **Content type**: `application/json`
4. **Events**: Select "Just the push event" or customize as needed
5. Click **Add webhook**

## 📁 Project Structure

```
hreviewer/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group (login, signup)
│   ├── dashboard/                # Protected dashboard routes
│   ├── api/                      # API routes
│   │   ├── auth/                 # Better-Auth endpoints
│   │   ├── inngest/              # Inngest webhook
│   │   └── webhooks/             # GitHub webhooks
│   └── layout.tsx                # Root layout
├── components/                   # Shared components
│   ├── ui/                       # Base UI components (Radix-based)
│   └── provider/                 # Context providers
├── lib/                          # Shared utilities
│   ├── auth.ts                   # Better-Auth server config
│   ├── auth-client.ts            # Better-Auth client SDK
│   ├── db.ts                     # Prisma client singleton
│   ├── generated/prisma/         # Generated Prisma client (custom location)
│   └── utils.ts                  # Utility functions
├── features/                       # Domain-driven feature modules
│   ├── auth/                     # Authentication module
│   ├── repository/               # GitHub repository management
│   ├── review/                   # Code review functionality
│   ├── settings/                 # User settings
│   ├── dashboard/                # Dashboard features
│   ├── ai/lib/                   # AI/RAG functionality
│   └── github/lib/               # GitHub API wrapper
├── prisma/                       # Database schema & migrations
│   ├── schema.prisma             # Prisma schema
│   └── migrations/               # Database migrations
├── public/                       # Static assets
└── .env                          # Environment variables (create this)
```

### Module Structure Pattern

Each feature module follows this structure:

```
features/[feature]/
├── actions/          # Server actions
├── components/       # Feature-specific components
├── hooks/            # Custom React hooks
├── constants/        # Feature constants
├── types/            # TypeScript types
└── utils/            # Utility functions
```

## 🗄️ Database Schema

### Key Models

- **User** - Core user model with subscription tracking
- **Session** - Active user sessions (Better-Auth)
- **Account** - OAuth provider accounts (GitHub)
- **Repository** - Synced GitHub repositories
- **Review** - AI-generated code review results
- **UserUsage** - Quota tracking per user

### Important Notes

- **Custom Prisma Location**: Client generated to `lib/generated/prisma/` (not default location)
- **Import Path**: Always use `@/lib/generated/prisma/client`, NEVER `@prisma/client`
- **Migrations**: Always create migrations for schema changes (`npx prisma migrate dev`)

## 🔄 Development Workflow

### Making Database Changes

1. Modify `prisma/schema.prisma`
2. Create migration:
   ```bash
   npx prisma migrate dev --name description_of_change
   ```
3. Regenerate client:
   ```bash
   npx prisma generate
   ```

### Adding New Features

1. Create feature module in `features/[feature-name]/`
2. Follow domain-driven design pattern
3. Add server actions in `actions/` directory
4. Create components in `components/` directory
5. Define constants in `constants/` directory
6. Add types in `types/` directory

### Protected Routes

Use `requireAuth()` utility in layouts or server components:

```typescript
import { requireAuth } from "@/features/auth/utils/auth-utils";

export default async function ProtectedLayout() {
  await requireAuth(); // Redirects to /login if not authenticated
  // ... rest of layout
}
```

## 🚢 Production Build

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Apply Migrations in Production

```bash
npx prisma migrate deploy
```

## 🌐 Deployment

### Environment Variables (Production)

Update the following for production:

- `BETTER_AUTH_URL` - Your production domain (e.g., `https://yourdomain.com`)
- `DATABASE_URL` - Production PostgreSQL connection string
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` - Production OAuth app credentials
- Update GitHub OAuth callback URL to production domain

### Recommended Platforms

- **Vercel** - Optimized for Next.js (automatic deployments)
- **Railway** - Easy PostgreSQL + app hosting
- **Render** - Full-stack deployment with databases
- **AWS** / **GCP** / **Azure** - Enterprise solutions

## 🧪 Testing

```bash
# Run linter
npm run lint

# Type checking
npx tsc --noEmit
```

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Better-Auth Documentation](https://better-auth.com)
- [Pinecone Documentation](https://docs.pinecone.io)
- [Google AI Documentation](https://ai.google.dev)
- [Inngest Documentation](https://www.inngest.com/docs)

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Important Notes

1. **Windows Users**: When using Edit tools, always use backslashes (`\`) in file paths
2. **Prisma Client**: Always import from `@/lib/generated/prisma/client`
3. **Auth Routes**: Better-Auth automatically creates endpoints at `/api/auth/*`
4. **Background Jobs**: Start Inngest dev server alongside Next.js for job processing
5. **Strict TypeScript**: Project uses strict mode - null checks required

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test database connection
npx prisma db pull

# Reset database (dev only)
npx prisma migrate reset
```

### Prisma Client Not Found

```bash
# Regenerate client
npx prisma generate
```

### Auth Callback Errors

- Verify `BETTER_AUTH_URL` matches your current environment
- Check GitHub OAuth callback URL configuration
- Ensure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct

### Webhook Not Receiving Events

- Use ngrok for local development: `npm run ngrok`
- Verify webhook URL in GitHub repository settings
- Check webhook delivery logs in GitHub

---
