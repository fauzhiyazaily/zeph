# Zeph

Zeph is a personal finance web app built with Next.js, Supabase, and AI-assisted transaction insights.

It helps users ingest payment messages, categorize spending, review AI classification, and track behavior patterns through dashboard insights.

All commands below assume you are in the `zeph/` project directory, not the monorepo root.

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

2. Create `.env.local` in the project root with your own keys.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Only the `NEXT_PUBLIC_...` values belong in browser-accessible code.

3. Configure Supabase Auth URLs in the Supabase Dashboard.

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

Set them in Supabase Dashboard → Authentication → URL Configuration.

4. Start the development server.

```bash
npm run dev
```

5. Open `http://localhost:3000`.

6. Verify baseline quality gates.

```bash
npm run lint
npm run test
```

`npm run test` opens Vitest in watch mode. For a one-shot run, use `npx vitest run`.

## Database Setup (Supabase Migrations)

Run these commands once after creating your Supabase project:

```bash
npx --yes supabase login
npx --yes supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

Migrations are stored in `supabase/migrations`.

`supabase login` opens a browser auth flow. For `supabase link`, use the project's Reference ID from Supabase Dashboard → Project Settings → General, not the full project URL.

## Available Scripts

```bash
npm run dev            # start local development server
npm run build          # production build
npm run start          # run production server
npm run lint           # lint the codebase
npm run test           # run unit tests in watch mode
npm run test:ui        # run Vitest UI
npm run security:check # validate env/secrets and runtime guardrails
npm run db:push        # push Supabase migrations with Supabase CLI 2.101.0
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
- `SUPABASE_SERVICE_ROLE_KEY` is server-only: never import or reference it from client components, browser bundles, or public routes.
- Use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in browser-accessible code.

## Troubleshooting

- Missing env vars:
  - Symptom: startup failures or runtime errors about missing Supabase/API configuration.
  - Fix: confirm all required keys exist in `/.env.local`, then restart `npm run dev`.

- Auth callback mismatch:
  - Symptom: sign-in redirects fail or callback errors after auth provider login.
  - Fix: ensure Supabase Auth Site URL is `http://localhost:3000` and Redirect URL is `http://localhost:3000/auth/callback`.

- Invalid Supabase URL/key:
  - Symptom: `401`/`403` responses, failed data fetches, or auth initialization errors.
  - Fix: verify project ref and keys copied from the same Supabase project; rotate compromised keys and update `/.env.local`.

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
