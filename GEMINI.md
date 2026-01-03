# HReviewer Project Context

## Project Overview

**HReviewer** is an AI-powered GitHub code review platform built with Next.js 16. It automates code analysis using Google AI and RAG (Retrieval-Augmented Generation) with Pinecone vector database.

### Key Technologies
- **Framework**: Next.js 16 (App Router), React 19
- **Language**: TypeScript (Strict Mode)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better-Auth (GitHub OAuth)
- **AI/ML**: Google AI SDK, Pinecone (Vector DB)
- **Background Jobs**: Inngest
- **Styling**: Tailwind CSS v4, Radix UI
- **Deployment**: Vercel / Railway / Render (implied)

## Building and Running

### Core Commands
- **Start Development Server**: `npm run dev` (Runs on http://localhost:3000)
- **Start Inngest Server**: `npm run inngest-dev` (Runs on http://localhost:8288)
- **Build for Production**: `npm run build`
- **Start Production Server**: `npm start`
- **Lint Code**: `npm run lint`

### Database Operations
- **Generate Prisma Client**: `npx prisma generate`
  - **Note**: Outputs to `lib/generated/prisma/` (Custom location)
- **Run Migrations**: `npx prisma migrate dev`
- **Open Database GUI**: `npx prisma studio`

## Development Conventions

### 1. Architecture & Folder Structure

The project follows a **Feature-Based Module Architecture** in the `module/` directory, combined with a categorized `components/` directory.

#### Feature Modules (`module/`)
Each domain feature (e.g., `auth`, `repository`, `review`) has its own directory:
- `module/[feature]/actions/`: Server Actions (`export async function`)
- `module/[feature]/components/`: Feature-specific UI components
- `module/[feature]/hooks/`: Custom React Hooks
- `module/[feature]/constants/`: Feature constants
- `module/[feature]/types/`: TypeScript type definitions
- `module/[feature]/utils/`: Utility functions

#### Components (`components/`)
- `components/ui/`: Pure UI primitives (shadcn/ui), no business logic.
- `components/layouts/`: App-wide layouts (Sidebar, Header).
- `components/common/`: Business components used in **3+ modules** (Rule of Three).
- `components/providers/`: React Context Providers.

### 2. Critical Implementation Details

- **Prisma Import**: ALWAYS import the Prisma client from `@/lib/generated/prisma/client`. NEVER import from `@prisma/client`.
- **File Paths (Windows)**: When using tools like `Edit` or `MultiEdit`, **ALWAYS use backslashes (`\`)** in file paths (e.g., `module\auth\index.ts`).
- **Server Actions**: Use `export async function name() { ... }` syntax. Prefixes: `get` (Read), `create` (Create), `update` (Update), `delete` (Delete).
- **Authentication**:
  - Use `requireAuth()` in Server Components/Actions to enforce session.
  - Better-Auth endpoints are at `/api/auth/[...all]`.

### 3. Naming Conventions

- **Files/Folders**: `kebab-case` (e.g., `user-profile.tsx`, `app-sidebar/`)
- **Components/Types**: `PascalCase` (e.g., `UserProfile`, `Repository`)
- **Functions/Variables**: `camelCase` (e.g., `getUserRepositories`, `isLoading`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_PAGE_SIZE`)
- **Hooks**: `use` prefix (e.g., `useRepositories`)

### 4. Code Style

- **Strict TypeScript**: No `any`, handle `null`/`undefined`.
- **Tailwind v4**: Use utility classes for styling.
- **Backslashes**: Mandatory for Windows file paths in tool calls.

## Documentation Reference
- `docs/conventions/folder-structure.md`: Detailed component placement rules.
- `docs/conventions/naming-conventions.md`: Naming rules for files, functions, and variables.
