# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**hreviewer** is a SaaS application for AI-powered GitHub code reviews, built using:

- **Framework**: Next.js 16 (App Router) with React 19
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better-Auth with GitHub OAuth
- **AI/Vector Search**: Google AI SDK + Pinecone for RAG-based code analysis
- **Background Jobs**: Inngest for async review processing
- **GitHub Integration**: Octokit + webhooks for repository sync
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI with custom components
- **Language**: TypeScript (strict mode enabled)

## Development Commands

### Core Development

```bash
npm run dev        # Start development server on http://localhost:3000
npm run build      # Build for production
npm start          # Run production build
npm run lint       # Run ESLint
npm run inngest-dev # Start Inngest dev server for background jobs
```

### Database Operations

```bash
# Generate Prisma client (after schema changes)
npx prisma generate

# Create and apply migrations
npx prisma migrate dev --name <migration_name>

# Apply migrations in production
npx prisma migrate deploy

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database (development only)
npx prisma migrate reset
```

## Architecture

### Database Architecture

**Custom Prisma Client Location**: The Prisma client is generated to `lib/generated/prisma/` (not the default location). This is configured in `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}
```

**Database Connection**: Uses `@prisma/adapter-pg` for PostgreSQL connection via the `pg` driver. The connection is initialized in `lib/db.ts` with a singleton pattern to prevent multiple instances in development.

**Schema Models**:

- `User` - Core user model with subscription tracking (`subscriptionTier`, `subscriptionStatus`)
- `Session` - Active user sessions with token-based auth
- `Account` - OAuth provider accounts (GitHub with `repo` scope)
- `Repository` - Synced GitHub repositories with metadata
- `Review` - Code review results with AI analysis and status tracking
- `UserUsage` - Quota tracking per user (review counts stored as JSON)
- `Verification` - Email/identity verification tokens
- `Test` - Example model (can be removed in production)

### Authentication Architecture

**Authentication System**: Better-Auth with Prisma adapter

- Configuration: `lib/auth.ts` - Server-side auth instance
- Client SDK: `lib/auth-client.ts` - Client-side auth utilities
- Provider: GitHub OAuth configured (requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`)
- Adapter: Uses Prisma models for user, session, account, and verification tables

**Auth Flow**:

1. GitHub OAuth redirects to Better-Auth endpoints (`/api/auth/[...all]`)
2. Better-Auth handles OAuth callback and token exchange
3. User data stored in Prisma database via adapter
4. Sessions managed with token-based authentication

**Auth Utilities** (`module/auth/utils/auth-utils.ts`):

- `requireAuth()` - Server-side session check, redirects to `/login` if unauthenticated
- `requireUnAuth()` - Ensures user is NOT logged in, redirects to `/dashboard` if authenticated

**Protected Routes**: Dashboard layout (`app/dashboard/layout.tsx`) uses `requireAuth()` to protect all child routes

### Module System

The codebase uses a `/module` directory for domain-driven feature organization:

- `module/auth/` - Authentication (components, utilities, constants)
- `module/repository/` - GitHub repository management (server actions, hooks)
- `module/review/` - Code review functionality (server actions)
- `module/settings/` - User settings
- `module/dashboard/` - Dashboard utilities and components
- `module/ai/lib/` - AI/RAG functionality (Pinecone embeddings, vector search)
- `module/github/lib/` - GitHub API wrapper (Octokit client)

**Server Actions Pattern**: Each module's server-side operations are in `actions/` directories (e.g., `module/repository/actions/index.ts` contains `getRepositoriesByUserId()`)

**Domain-Driven Design**: Features are grouped by business logic (auth, repository, review) rather than technical layers (components, utils, hooks)

**Constants Management Pattern**:

Each module should manage its constants in a dedicated `constants/` directory:

```
module/
  └── [feature]/
      ├── components/
      ├── constants/
      │   └── index.ts
      └── ...
```

**Example** (`module/auth/constants/index.ts`):

```typescript
export interface LoginFeature {
  icon: string;
  text: string;
}

export const LOGIN_FEATURES: LoginFeature[] = [
  { icon: "⚡", text: "Instant AI-powered reviews" },
  { icon: "🔍", text: "Deep code analysis" },
  { icon: "🛡️", text: "Security vulnerability detection" },
];
```

**Usage in components**:

```typescript
import { LOGIN_FEATURES } from "@/module/auth/constants";
```

**Benefits**:

- Centralized constant management per feature module
- Type-safe with interface definitions
- Easy to maintain and update
- Reusable across multiple components within the module

### Path Aliases

TypeScript path alias `@/*` maps to the root directory:

```typescript
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
```

### Environment Variables

Required environment variables (create `.env` file):

```
DATABASE_URL="postgresql://user:password@host:port/dbname"
GITHUB_CLIENT_ID="gh_..."
GITHUB_CLIENT_SECRET="gh_..."
BETTER_AUTH_URL="http://localhost:3000"  # Auth callback URL (dev)
PINECONE_DB_API_KEY="pcn_..."            # Vector database
GOOGLE_GENERATIVE_AI_API_KEY="..."      # For embeddings
```

## Key Technical Details

### Prisma Configuration

- **CRITICAL**: Client generated to custom location `lib/generated/prisma/` (not default `node_modules/.prisma/client`)
- **Import Path**: Always use `@/lib/generated/prisma/client`, NEVER `@prisma/client`
- Migrations stored in `prisma/migrations/`
- Uses PostgreSQL adapter (`@prisma/adapter-pg`) with native `pg` driver

### Next.js App Router

- Uses Next.js 16 App Router (not Pages Router)
- Route groups: `app/(auth)/` for authentication routes
- Server Components by default (use `"use client"` directive when needed)

### Component Structure

- UI components in `/components/ui/` (Radix-based)
- Feature modules in `/module/[feature]/components/`
- Shared utilities in `/lib/utils.ts` (includes `cn()` for className merging)

#### Component Hierarchy Pattern

**Complex components with sub-components use the `parts/` folder pattern** to maintain clear parent-child relationships:

```
components/[component-name]/
├── ui/
│   ├── [component-name].tsx    # Parent component
│   └── parts/                  # Child components (internal use only)
│       ├── logo.tsx
│       ├── navigation.tsx
│       └── footer.tsx
├── hooks/
├── constants/
└── types/
```

**Example** (`components/app-sidebar/`):

```
components/app-sidebar/
├── ui/
│   ├── app-sidebar.tsx         # Main component
│   └── parts/
│       ├── logo.tsx
│       ├── user-profile.tsx
│       ├── user-avatar.tsx
│       ├── navigation.tsx
│       ├── nav-item.tsx
│       ├── theme-toggle.tsx
│       ├── logout-button.tsx
│       └── footer.tsx
├── hooks/
│   ├── use-sidebar-state.ts
│   └── use-sidebar-actions.ts
├── constants/
│   └── index.ts
└── types/
    └── index.ts
```

**Import convention**:

```typescript
// In parent component (app-sidebar.tsx)
import { Logo } from "./parts/logo";
import { UserProfile } from "./parts/user-profile";

// From external files
import AppSidebar from "@/components/app-sidebar/ui/app-sidebar";
```

**Naming conventions**:

- ✅ Parent component: `[component-name].tsx` (e.g., `app-sidebar.tsx`)
- ✅ Child components: No prefix needed (e.g., `logo.tsx`, not `sidebar-logo.tsx`)
- ✅ Already scoped by folder structure, avoid redundant prefixes

**Benefits**:

- Clear visual hierarchy (parent vs child components)
- Prevents namespace pollution at the same level
- Easier to understand component relationships
- Consistent pattern across the entire codebase
- Child components are clearly marked as internal to the parent

### Styling

- Tailwind CSS v4 with PostCSS
- Custom animations via `tw-animate-css`
- Global styles in `app/globals.css`
- CSS custom properties for theming

### State Management

**React Query v5** (`@tanstack/react-query`):

- Provider setup: `components/provider/query-provider.tsx`
- Used for server state caching and synchronization
- Example hooks: `module/repository/hooks/use-repositories.ts` uses `useQuery` for fetching repositories

**Client Hooks Pattern**:

- `useSession()` - From `lib/auth-client.ts` for auth state
- Custom hooks in `module/*/hooks/` for feature-specific data fetching
- Example: `useConnectRepository()` in `module/repository/hooks/use-connect-repository.ts`

### AI & RAG Architecture

**Vector Database**: Pinecone (index: "hreviewer") for codebase embeddings

**Embedding Pipeline** (`module/ai/lib/rag.ts`):

- `generateEmbedding()` - Uses Google Generative AI to create vector embeddings
- `storeCodeEmbedding()` - Stores code + metadata in Pinecone
- `searchSimilarCode()` - Queries Pinecone for similar code patterns

**Background Jobs** (Inngest):

- `app/api/inngest/route.ts` - Webhook endpoint for async job processing
- Used for heavy AI operations and codebase indexing

### GitHub Integration

**API Client** (`module/github/lib/github.ts`):

- Octokit wrapper for GitHub API operations
- OAuth scope: `["repo"]` for read access to repository metadata

**Webhook Handler** (`app/api/webhooks/github/route.ts`):

- Receives GitHub events (push, PR opened, etc.)
- Triggers repository sync and review processing
- **Setup**: Configure webhook URL in GitHub repo settings (requires public URL or ngrok for local dev)

**Repository Sync Flow**:

1. User connects GitHub account via OAuth
2. Repositories synced to `Repository` table
3. Webhook events trigger background jobs for code review
4. Review results stored in `Review` table with AI analysis

## Important Notes

1. **Always regenerate Prisma client after schema changes**:

   - Modify `prisma/schema.prisma`
   - Run `npx prisma migrate dev --name <description>` to create and apply migration
   - Run `npx prisma generate` to regenerate client in `lib/generated/prisma/`

2. **Custom Prisma client path**: Import from `@/lib/generated/prisma/client`, NEVER `@prisma/client`

3. **Database migrations are required**: Never modify the database directly; always create migrations

4. **Authentication routes**: Better-Auth automatically creates auth endpoints at `/api/auth/*`

5. **Protected routes**: Use `requireAuth()` in layouts or server components to protect routes

6. **GitHub webhook local development**: Use ngrok or similar to expose localhost for webhook testing

7. **Background jobs**: Start Inngest dev server (`npm run inngest-dev`) alongside Next.js dev server for job processing

8. **Subscription tiers**: User model tracks `subscriptionTier` (FREE by default) and `subscriptionStatus`

9. **Strict TypeScript**: The project uses strict mode; null checks and type safety are enforced

## Plans

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise. Sacrifice grammar for the sake of concision.

## CRITICAL: File Editing on Windows

### ⚠️ MANDATORY: Always Use Backslashes on Windows for File Paths

**When using Edit or MultiEdit tools on Windows, you MUST use backslashes (`\`) in file paths, NOT forward slashes (`/`).**

#### ❌ WRONG - Will cause errors:

```
Edit(file_path: "D:/repos/project/file.tsx", ...)
MultiEdit(file_path: "D:/repos/project/file.tsx", ...)
```

#### ✅ CORRECT - Always works:

```
Edit(file_path: "D:\repos\project\file.tsx", ...)
MultiEdit(file_path: "D:\repos\project\file.tsx", ...)
```

## Plans

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise. Sacrifice grammar for the sake of concision.

## CRITICAL: File Editing on Windows

### ⚠️ MANDATORY: Always Use Backslashes on Windows for File Paths

**When using Edit or MultiEdit tools on Windows, you MUST use backslashes (`\`) in file paths, NOT forward slashes (`/`).**

#### ❌ WRONG - Will cause errors:

```
Edit(file_path: "D:/repos/project/file.tsx", ...)
MultiEdit(file_path: "D:/repos/project/file.tsx", ...)
```

#### ✅ CORRECT - Always works:

```
Edit(file_path: "D:\repos\project\file.tsx", ...)
MultiEdit(file_path: "D:\repos\project\file.tsx", ...)
```
