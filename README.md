This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Baseline Setup

This project was initialized with the approved architecture starter:

```bash
npx create-next-app@16.2.6 zeph \
	--ts \
	--tailwind \
	--eslint \
	--app \
	--src-dir \
	--import-alias "@/*" \
	--yes
```

### Prerequisites

- Node.js 20+
- npm 10+

### First-Time Local Setup

```bash
npm install
npm run dev
```

### Authentication Setup (Supabase)

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Set these values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=server_only_service_role_key
ANTHROPIC_API_KEY=server_only_anthropic_key
```

Do not prefix sensitive keys with `NEXT_PUBLIC_`.

4. In Supabase Auth settings, add these redirect URLs:

- `http://localhost:3000/auth/callback`

5. Optional for OAuth: enable Google provider in Supabase Auth.

### Auth Routes

- `/sign-up` for registration
- `/sign-in` for email/password or Google sign-in
- `/dashboard` protected route (requires session)
- `/auth/callback` OAuth + email verification callback
- `/onboarding/consent` consent grant/revoke onboarding step
- `/settings/privacy` consent management in settings

### Session and Logout Behavior

- Supabase session cookies are refreshed by middleware on app requests.
- Protected routes redirect unauthenticated users to `/sign-in` with a safe return path.
- Sign-out invalidates the current session and immediately blocks protected route access until re-authentication.

### Consent and Ingestion Boundary (Story 1.4)

- Message-reading consent is persisted per user in auth metadata.
- Consent can be granted/revoked from onboarding and privacy settings.
- Ingestion boundary route `/api/ingestion/payment-message` enforces consent.
- If consent is missing, ingestion is blocked with `403` and an audit event is logged.

### Payment Message Webhook Ingestion (Story 2.1)

- Endpoint: `POST /api/ingestion/payment-message`
- Requires authenticated user + active message-reading consent.
- Request payload:

```json
{
	"message": "Rs 145 paid to Metro Rail via UPI Ref 123ABC",
	"receivedAt": "2026-05-09T07:30:00.000Z",
	"sourceHint": "sms",
	"messageId": "optional-client-message-id"
}
```

- Successful parse returns `202` with normalized fields:
	- amount
	- merchant
	- source
	- reference
	- timestamp
- Parse failures return `422` with retryability metadata.
- Retry-safe behavior uses ingestion idempotency via `messageId`/`x-message-id` and deduplicates recent replays.

### Transaction Persistence and Metadata Model (Story 2.2)

- Parsed transactions are persisted to user-scoped `transactions` records.
- Duplicate-unsafe writes are blocked with DB-level uniqueness on `(user_id, ingestion_id)`.
- Validation guards include amount positivity, merchant length, source enum checks, and required timestamps.
- The webhook returns `transactionId` on success and surfaces retryability on persistence failures (`422` or `503`).
- SQL migration is in `supabase/migrations/202605090001_create_transactions.sql`.

### Uncategorized Queue and Category Assignment (Story 2.3)

- Dashboard surfaces uncategorized transactions prominently in a dedicated queue.
- Each queue item supports direct category assignment via server action.
- Category updates are written to backend transaction records and dashboard state is refreshed immediately.

### Transaction Edit and Bulk Categorization Tools (Story 2.4)

- Dashboard includes inline transaction detail editing (merchant, amount, source, reference, date, category).
- Users can select multiple transactions and apply bulk category updates in one action.
- Updates are user-scoped in backend writes, and failures return actionable status banners for retry/reselection.

### Searchable Transaction History (Story 2.5)

- Route: `/transactions`
- Supports user-scoped filtering by:
	- text search (`merchant`, `reference`)
	- source
	- category
	- date range (`from`, `to`)
- Includes paginated results with Previous/Next navigation.
- Includes one-tap clear-all filter reset.
- Performance indexes for common history queries are in:
	- `supabase/migrations/202605090002_transactions_history_indexes.sql`

### Real-Time AI Classification Pipeline (Story 3.1)

- Ingestion now triggers transaction classification after persistence.
- Classification attempts Claude first and falls back to safe heuristic logic when needed.
- Failures in classification do not block transaction visibility.
- Classification outputs are persisted to:
	- `ai_classification` (`wise` | `useless`)
	- `ai_reason` (short rationale)
- DB constraints/indexes are in:
	- `supabase/migrations/202605090003_transactions_ai_classification_constraints.sql`

### Classification Display and Override (Story 3.2)

- Users can accept AI classification or override it from transaction history.
- Override persistence updates effective classification fields used by downstream analytics inputs.
- Original AI output is retained for auditability in:
	- `ai_raw_classification`
	- `ai_raw_reason`
- Review lifecycle fields:
	- `ai_review_state` (`pending` | `accepted` | `overridden`)
	- `ai_user_classification`
	- `ai_user_reason`
	- `ai_override_at`
- Schema changes are in:
	- `supabase/migrations/202605090004_transactions_ai_override_state.sql`

### Habit Trend Insights Engine (Story 3.3)

- Dashboard now includes a habit trend insights module generated from each user's classified transactions.
- Insight summaries highlight category-level recurring patterns and frequency trends over periodic windows.
- Insight text is kept user-safe, actionable, and grounded in personal spend/classification data.
- Insufficient-history states are handled explicitly until enough classified samples exist.
- Insight generation logic lives in:
	- `src/lib/insights/habit-trends.ts`

### Dashboard Overview Visualization and Drilldown

- Dashboard now includes an overview waffle visualization with period toggle:
	- This week
	- Last week
- Category legend entries are drilldown controls that:
	- focus recent transactions on dashboard
	- deep-link into `/transactions` with category + date-range context
- When a category is focused, a linked AI recommendation context card appears with:
	- classified ratio for the focused category
	- estimated useless spend for the active period
	- actionable reduction target and rationale snippet
- Breakdown and waffle generation helpers live in:
	- `src/lib/insights/category-breakdown.ts`

### Security and Encryption Baseline (Story 1.5)

- Security headers are enabled in Next.js config (`HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`).
- Sensitive credentials are server-only and must never be exposed via `NEXT_PUBLIC_` prefixes.
- Runtime guard enforces:
	- no leaked `NEXT_PUBLIC_*` secret variants,
	- required server secret presence (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`),
	- HTTPS Supabase transport in non-local environments.
- Runtime guard is applied in server auth actions, ingestion boundary routes, and server Supabase client creation.

### Applying Supabase Migrations

To apply local SQL migrations (including Story 2.2 transactions schema):

1. Authenticate Supabase CLI:

```bash
npx --yes supabase login
```

2. Link this workspace to your Supabase project:

```bash
npx --yes supabase link --project-ref YOUR_PROJECT_REF
```

3. Push migrations:

```bash
npm run db:push
```

Migration file for Story 2.2:

- `supabase/migrations/202605090001_create_transactions.sql`
- Automated check available:

```bash
npm run security:check
```

### Baseline Validation

```bash
npm run lint
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
