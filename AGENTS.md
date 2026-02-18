# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router pages, route groups, and API routes (`app/api/auth`, `app/api/webhooks/github`, `app/api/inngest`).
- `module/`: feature modules (`auth`, `repository`, `review`, `dashboard`, `settings`, `ai`, `github`). Keep feature logic, UI, hooks, and actions colocated.
- `components/`: shared UI and layout primitives (`components/ui`, `components/layouts`, `components/provider`).
- `lib/`: cross-cutting utilities (auth/session helpers, DB client, shared helpers).
- `prisma/`: schema and migrations. `inngest/`: background jobs. `public/`: static assets. `docs/`: specs and conventions.

## Agent Mandatory Reference Rules
- Before starting any implementation, refactor, or review task, always check `docs/conventions/` first.
- Treat every document in `docs/conventions/` as required coding policy, not optional guidance.
- Apply convention updates immediately when new files are added under `docs/conventions/`.
- If a task conflicts with a convention, call out the conflict explicitly and ask for direction before proceeding.
- When a spec under `docs/specs/` reaches `Implemented` status, move it to `docs/archive/` in the same task.

## Build, Test, and Development Commands
- `npm run dev`: start the Next.js dev server.
- `npm run inngest-dev`: run the Inngest local worker/UI.
- `npm run lint`: run ESLint (Next.js core-web-vitals + TypeScript rules).
- `npx tsc --noEmit`: run strict type-checking.
- `npm run build`: production build.
- `npm run next-build` (or `npm run vercel-build`): generate Prisma client, apply migrations, then build.
- `npx prisma migrate dev --name <change>`: create and apply local migrations.

## Coding Style & Naming Conventions
- Use TypeScript-first patterns; `strict` mode is enabled in `tsconfig.json`.
- Use 2-space indentation and prefer path aliases (`@/*`) for internal imports.
- File and folder names use `kebab-case` (example: `repository-list.tsx`, `get-dashboard-stats.ts`).
- Components and type names use `PascalCase`; variables/functions use `camelCase`; constants use `UPPER_SNAKE_CASE`.
- Hooks must start with `use` (example: `use-repositories.ts`).

## Testing Guidelines
- No dedicated test runner is configured yet; required pre-PR checks are:
  - `npm run lint`
  - `npx tsc --noEmit`
- For DB/auth/webhook changes, manually verify flows in local dev and list test steps in the PR.
- If you add tests, use `*.test.ts` or `*.test.tsx` near the related module.

## Commit & Pull Request Guidelines
- Follow the project’s commit style: `<type> : <summary>` (examples: `feat : subscription`, `fix : language select error`).
- Common types in history: `feat`, `fix`, `refactor`, `update`.
- PRs should include scope, changed paths, migration/env updates, and validation steps.
- Include screenshots or short recordings for UI changes and link related issues/specs.

## Security & Configuration Tips
- Do not commit `.env` or secrets.
- Store OAuth, database, Pinecone, and Google AI credentials in environment variables only.
- Schema changes must include Prisma migration files in `prisma/migrations/`.
