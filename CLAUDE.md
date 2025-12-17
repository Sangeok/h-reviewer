# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**hreviewer** is a Next.js 16 application with authentication, built using:

- **Framework**: Next.js 16 (App Router) with React 19
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better-Auth with GitHub OAuth
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

- `User` - Core user model for authentication
- `Session` - Active user sessions with token-based auth
- `Account` - OAuth provider accounts (supports multiple providers per user)
- `Verification` - Email/identity verification tokens
- `Test` - Example model (can be removed in production)

### Authentication Architecture

**Authentication System**: Better-Auth with Prisma adapter

- Configuration: `lib/auth.ts` - Server-side auth instance
- Client SDK: `lib/auth-client.ts` - Client-side auth utilities
- Provider: GitHub OAuth configured (requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`)
- Adapter: Uses Prisma models for user, session, account, and verification tables

**Auth Flow**:

1. GitHub OAuth redirects to Better-Auth endpoints
2. Better-Auth handles OAuth callback and token exchange
3. User data stored in Prisma database via adapter
4. Sessions managed with token-based authentication

### Module System

The codebase uses a `/module` directory for feature organization:

- `module/auth/components/` - Authentication-related components
- `module/auth/constants/` - Authentication-related constants
- `module/test/` - Test-related modules

This follows a domain-driven design pattern where features are grouped by business logic rather than technical layers.

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
DATABASE_URL="postgresql://..."
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
```

## Key Technical Details

### Prisma Configuration

- Uses `prisma.config.ts` (not `prisma.schema`) for configuration
- Migrations stored in `prisma/migrations/`
- Client generated to custom location: `lib/generated/prisma/`

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
import { Logo } from './parts/logo';
import { UserProfile } from './parts/user-profile';

// From external files
import AppSidebar from '@/components/app-sidebar/ui/app-sidebar';
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

## Important Notes

1. **Always regenerate Prisma client after schema changes**: Run `npx prisma generate` after modifying `prisma/schema.prisma`
2. **Database migrations are required**: Never modify the database directly; always create migrations
3. **Authentication routes**: Better-Auth automatically creates auth endpoints at `/api/auth/*`
4. **Custom Prisma client path**: Import from `@/lib/generated/prisma/client`, not `@prisma/client`
5. **Strict TypeScript**: The project uses strict mode; null checks and type safety are enforced

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
