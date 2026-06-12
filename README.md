# SkillPath

A bilingual (Finnish 🇫🇮 / English 🇬🇧) career & skills guidance web app. People
describe their experience in plain language; SkillPath maps it to occupations and
shows skill gaps — using the EU **ESCO v1.2.1** classification as an invisible
engine. Users never browse ESCO's ~13,900 skills directly.

> Built with Next.js (App Router), TypeScript, Tailwind v4, Supabase (Postgres +
> Auth), next-intl, and Recharts.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, RSC, Server Actions) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn-style primitives |
| Data / Auth | Supabase (Postgres + RLS + Supabase Auth) |
| i18n | next-intl (`fi` default, `en`; `/fi` & `/en` prefixes) |
| Charts | Recharts (client islands, with accessible data-table fallbacks) |
| Validation | Zod |
| Client cache | TanStack Query (search-as-you-type only) |

> **Note on the version:** the brief specified Next.js 15; `create-next-app`
> installed the current latest, **16.2.9**. The App Router APIs we use are
> identical. Two Next 16 specifics to know:
> - `middleware.ts` is renamed to **`proxy.ts`** (see [`src/proxy.ts`](src/proxy.ts)).
> - `params` / `searchParams` are **async** (Promises) in pages, layouts and routes.

---

## Project structure

```
src/
  app/[locale]/            # localized routes (landing, login, signup, onboarding,
                           #   dashboard/**, occupation/[code], occupations, skill/[id])
  components/ui/           # shadcn-style primitives (button, card, dialog, …)
  components/charts/       # Recharts islands + ChartDataTable a11y fallback
  features/
    auth/                  # auth form, guest mode, guest→DB migration
    onboarding/            # 3-step wizard
    dashboard/             # widgets + data aggregator
    matching/              # match RPC wrapper, results UI, set-target button
    profile/               # skills manager, learning, account, AI assist
    explore/               # search-as-you-type components
  lib/
    supabase/              # browser / server / proxy clients
    esco/                  # ALL ESCO read logic (queries.ts) + types + isco map
    db/                    # user-table reads, mutations, snapshot writer
    ai/                    # analyze-free-text (trigram stub, LLM-swap ready)
  i18n/                    # next-intl routing / request / navigation
messages/                  # fi.json (default) + en.json
supabase/migrations/       # SQL to run by hand in the Supabase SQL editor
```

The matching math lives in Postgres (`match_occupations` RPC); the app only has a
thin typed wrapper. All ESCO reads are isolated in [`src/lib/esco/queries.ts`](src/lib/esco/queries.ts)
— if your imported ESCO column names differ from the assumed schema, that's the
only file to touch.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Copy the example and fill in your Supabase project values:

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key (server-only!) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally; your domain in prod |
| `NEXT_PUBLIC_FEATURE_AI_ASSIST` | `true` to show the AI-assist panel |

> The app **builds and runs with the placeholder values** — data-driven pages
> simply show empty states until real keys are added.

### 3. ESCO data

This app assumes the read-only ESCO v1.2.1 tables already exist in your Supabase
project: `occupations`, `skills`, `occupation_skill_relations` (import the ESCO CSV
release into these). The assumed columns are documented in
[`src/lib/esco/types.ts`](src/lib/esco/types.ts).

Verify after importing:

```sql
select
  (select count(*) from occupations)               as occupations,
  (select count(*) from skills)                     as skills,
  (select count(*) from occupation_skill_relations) as relations;
```

### 4. Run the migrations (in order)

Open Supabase → **SQL editor** and run each file from `supabase/migrations/`, in
numeric order:

1. `0001_user_tables.sql` — user tables, profile-on-signup trigger, RLS
2. `0002_indexes_trgm.sql` — `pg_trgm`, trigram GIN indexes, relation indexes
3. `0003_match_occupations.sql` — the `match_occupations(p_user_id)` RPC
4. `0004_esco_rls.sql` — public read-only RLS on the ESCO tables

They are re-runnable (idempotent) so you can apply them again safely.

### 5. Configure Supabase Auth

In Supabase → **Authentication**:

- **URL Configuration → Redirect URLs**: add
  - `http://localhost:3000/fi/auth/callback`
  - `http://localhost:3000/en/auth/callback`
  - (and the same for your production domain)
- **Email**: magic-link sign-in is enabled by default.
- **Google OAuth (optional)**: Providers → Google → enable, paste your Google
  OAuth client ID/secret. In the Google Cloud console set the authorized redirect
  URI to `https://<your-project>.supabase.co/auth/v1/callback`.

### 6. Develop

```bash
npm run dev      # http://localhost:3000  (redirects to /fi)
npm run build    # production build
npm start        # serve the production build
npm run lint     # ESLint
```

---

## How it works

- **Guest mode** — unauthenticated users can search skills and view occupation
  pages, building a temporary profile in `sessionStorage`. Trying to save/match/open
  the dashboard shows a "create a free account" gate; on signup the profile is
  migrated into the DB ([`features/auth/guest-migrator.tsx`](src/features/auth/guest-migrator.tsx)).
- **Onboarding** — a 3-step wizard (current occupation → add skills → target
  occupations) seeds the profile, then lands on the dashboard.
- **Matching** — `match_occupations` weights essential coverage `0.7` and optional
  `0.3`, returns the top 30. Never computed client-side.
- **Snapshots** — every change to `user_skills` writes a `user_match_snapshots`
  row per target (one helper: [`lib/db/snapshots.ts`](src/lib/db/snapshots.ts)),
  powering the "progress over time" chart.
- **Accessibility** — every chart renders a visually-hidden data table; semantic
  HTML, keyboard navigation, WCAG AA colors, dark mode.

## Security

Row Level Security is enabled on every user table (`user_id = auth.uid()`). ESCO
tables are public read-only. The `service_role` key is used only server-side, for
guest-profile migration and account deletion (GDPR erasure cascades via FKs).
