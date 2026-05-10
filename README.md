# Zeph

Zeph is a personal finance web app built with Next.js, Supabase, and AI-assisted transaction insights.

It helps users ingest payment messages, categorize spending, review AI classification, and track behavior patterns through dashboard insights.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Supabase (Auth + Database)
- Vitest + ESLint

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project
- An Anthropic API key

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Create `/.env.local` in the project root with your own keys.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY
```

3. Configure Supabase Auth URLs.

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

4. Start the development server.

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Database Setup (Supabase Migrations)

Run these commands once after creating your Supabase project:

```bash
npx --yes supabase login
npx --yes supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

Migrations are stored in `supabase/migrations`.

## Available Scripts

```bash
npm run dev            # start local development server
npm run build          # production build
npm run start          # run production server
npm run lint           # lint the codebase
npm run test           # run unit tests
npm run test:ui        # run Vitest UI
npm run security:check # run security checks
npm run db:push        # push Supabase migrations
```

## Core Features

- Authentication: sign-up/sign-in with protected routes.
- Consent boundary: ingestion only allowed when user consent is active.
- Payment message ingestion endpoint: `POST /api/ingestion/payment-message`.
- Transaction pipeline: parse, persist, classify, and review.
- Transaction history: filters, pagination, and bulk category tools.
- AI-assisted insights: habit trends and recommendation context.

## Security Notes

- Never commit real secrets.
- Keep all secrets in `/.env.local` (already ignored by git).
- Do not expose server secrets with `NEXT_PUBLIC_` prefixes.

## Project Structure

- `src/app`: App Router routes and server actions
- `src/lib`: domain and infrastructure logic (auth, ingestion, insights, security)
- `supabase/migrations`: schema and index migrations
- `scripts`: local security and utility scripts

## Deployment

Build and run locally in production mode:

```bash
npm run build
npm run start
```

You can deploy to any Next.js-compatible platform (for example Vercel) after setting the same environment variables in that platform.
