# CodePlans

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-SQLite_%7C_Postgres-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/Tests-148_passing-brightgreen?logo=vitest&logoColor=white)](tests/)
[![Status](https://img.shields.io/badge/Status-Coming%20Soon-blue)](https://codeplans.ai)

**Coordinate and track changes across your software architecture.**

CodePlans is an open-source engineering planning tool that helps teams manage coordinated code changes across complex systems. It organises work in a clear hierarchy — Products → Assets → Code Plans → Tasks — giving teams a shared view of what's changing, where, and why.

→ **Beta signup:** [codeplans.ai](https://codeplans.ai) · **Docs:** [sylonzero.github.io/CodePlans](https://sylonzero.github.io/CodePlans)

---

## Why CodePlans?

Modern engineering teams struggle with change coordination across distributed codebases. Tickets track individual tasks but miss the bigger picture; architecture docs go stale; migrations and refactors span multiple services with no shared source of truth.

CodePlans sits between your issue tracker and your architecture diagram:

- **Products** group your system's components under a planning boundary
- **Assets** represent individual components (apps, services, libraries, datastores, platforms) with health and tech debt tracking
- **Code Plans** coordinate related changes across assets with assignees, deadlines, and progress tracking
- **Tasks** are the individual units of work tied to a plan and optionally scoped to a specific asset

---

## Features

| Feature | Status |
|---|---|
| Products & asset inventory | ✅ Available |
| Product, asset, plan & task create/edit (side panels & quick modals) | ✅ Available |
| Workspace product switcher (filter all pages by product) | ✅ Available |
| Tech debt scoring per asset | ✅ Available |
| Code Plans with status lifecycle (draft → active → completed) | ✅ Available |
| Task management (list & kanban views, deep-linkable task panel) | ✅ Available |
| Dashboard with velocity metrics | ✅ Available |
| Organization & team management | ✅ Available |
| Role-based access (owner / admin / editor / viewer) | ✅ Available |
| SQLite local mode (no cloud required) | ✅ Available |
| Supabase + Postgres cloud mode | ✅ Available |
| Pluggable auth (local password or Supabase) | ✅ Available |
| Work items — features, bugs & tech debt register, linkable to code plans | ✅ Available |
| Per-asset branch & PR tracking on code plans | ✅ Available |
| Asset dependency mapping & plan impact analysis | ✅ Available |
| Analytics wired to real data (velocity, effort accuracy, debt by product) | ✅ Available |
| Activity feed | ✅ Available |
| GitHub & GitLab Issues integrations (pull-only mirror into work items) | ✅ Available |
| Jira / Asana / Linear connectors | 🔜 Planned |
| Milestone-linked plans with mirrored tasks (mixed mode) | ✅ Available |
| PR auto-linking (plan-asset PR status refreshed on sync) | ✅ Available |
| AI-assisted effort estimation | 🔜 Planned |
| Billing / subscription management | 🔜 Planned (optional, feature-flagged) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Components) |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS v4 + Radix UI primitives |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Database | SQLite (local / libsql) or PostgreSQL (cloud) |
| Auth | Local (bcrypt + session cookie) or Supabase |
| Charts | Recharts |
| Testing | Vitest (148 tests) |

---

## Deployment Modes

CodePlans has two independent configuration axes that control how an instance behaves.

### `HOST_MODE` — the deployment model

| Value | Description |
|---|---|
| `team` | Single private team. One organisation, no open registration, billing UI hidden. The right default for self-hosted installs. |
| `saas` | Multi-tenant hosted. Multiple independent orgs can exist, open registration is possible, billing UI available. |

### `REGISTRATION` — who can create accounts

| Value | Description |
|---|---|
| `closed` | `/signup` returns 404. Users are created by an admin via `pnpm db:seed` or a future admin CLI. |
| `invite` | `/signup` shows an invite-only message. (Token-based invite flow is planned.) |
| `open` | Anyone who can reach the server can sign up. |

### Common combinations

**Self-hosted team** (recommended default):
```bash
HOST_MODE=team
REGISTRATION=closed
```

**Hosted SaaS with open signup:**
```bash
HOST_MODE=saas
REGISTRATION=open
```

**Closed beta / waitlist:**
```bash
HOST_MODE=saas
REGISTRATION=invite
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)

### Self-hosted team (SQLite, no cloud required)

```bash
# 1. Clone the repo
git clone https://github.com/SylonZero/CodePlans.git
cd CodePlans

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env.local
# .env.example defaults to HOST_MODE=team, REGISTRATION=closed, SQLite — no changes needed

# 4. Run migrations and create the admin account
pnpm db:migrate
pnpm db:seed

# 5. Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with:

| Field | Value |
|---|---|
| Email | `admin@example.com` |
| Password | `Password1!` |

Change your password in **Settings → Security** after first login.

> **Want realistic demo data?** Run `pnpm db:seed-demo` after `pnpm db:seed` to populate the workspace with products, assets, plans, and tasks. All demo accounts use password `Password1!` — see [Demo accounts](#demo-accounts) below.

> **Deploying to a server?** Set `AUTH_URL=https://your-server-domain` (or `http://ip:port`) in `.env.local`. Auth.js requires this in production to construct correct callback URLs — without it, login redirects will fail.  
> If running the dev server on a remote machine, also set `ALLOWED_DEV_ORIGINS=your.server.ip`.

### Cloud (Supabase + Postgres) mode

```bash
# Set these variables in .env.local
HOST_MODE=saas
REGISTRATION=open
AUTH_PROVIDER=supabase
DB_PROVIDER=postgres
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-service-role-key
```

Then run `pnpm db:migrate` and `pnpm dev`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the dev server binds to |
| `HOST_MODE` | `saas` | `team` (private self-hosted) or `saas` (multi-tenant hosted) |
| `REGISTRATION` | `open` | `closed`, `invite`, or `open` — controls who can create accounts |
| `AUTH_PROVIDER` | `local` | `local` (bcrypt + session cookie) or `supabase` |
| `DB_PROVIDER` | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_URL` | `:memory:` | SQLite: `file:data/codeplans.db` or `:memory:`. Postgres: full connection string |
| `DB_SSL` | `true` | Set `false` for local or non-SSL Postgres |
| `AUTH_SECRET` | — | Secret for local auth session signing (min 32 chars) |
| *(your token var)* | — | GitHub integration connections reference a server env var by name (e.g. `GITHUB_SYNC_TOKEN`) holding a repo-read token (GitHub) or `read_api` token (GitLab); tokens are never stored in the database |
| `AUTH_URL` | — | **Required in production.** Full URL of the server (e.g. `https://codeplans.yourteam.com`). Auth.js uses this to construct callback URLs and validate login redirects. Not needed for `localhost` dev. |
| `BILLING_ENABLED` | `true` | Set `false` to hide billing UI (always off in `team` mode) |
| `ALLOWED_DEV_ORIGINS` | — | Comma-separated hosts allowed to access Next.js dev resources (needed when running on a remote server) |
| `RESEND_API_KEY` | — | Resend API key for transactional email (email change verification, future invites). Without this, verification URLs are logged to the server console (dev only). |
| `RESEND_FROM_EMAIL` | `CodePlans <noreply@codeplans.ai>` | From address used in outgoing emails |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Required for Supabase auth mode |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | — | Required for Supabase auth mode |
| `SUPABASE_SECRET_KEY` | — | Required for Supabase auth mode (server-side) |

---

## Project Structure

```
CodePlans/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Login & signup pages
│   └── (dashboard)/            # Protected app pages
│       ├── page.tsx            # Dashboard
│       ├── products/           # Product list + detail
│       ├── plans/              # Code Plans list + detail
│       ├── tasks/              # Task management
│       ├── team/               # Team & org management
│       ├── analytics/          # Analytics
│       └── settings/           # User settings
├── components/
│   ├── app-shell.tsx           # Sidebar + header layout
│   ├── dashboard/              # Dashboard widgets
│   └── ui/                     # Radix/shadcn primitives
├── lib/
│   ├── auth/                   # Pluggable auth adapters
│   ├── db/
│   │   ├── schema.sqlite.ts    # SQLite schema (Drizzle)
│   │   ├── schema.pg.ts        # Postgres schema (Drizzle)
│   │   ├── queries.ts          # Read queries
│   │   ├── mutations.ts        # Write operations
│   │   ├── migrations/         # SQL migration files
│   │   └── seed.ts             # Development seed data
│   ├── config.ts               # Environment config
│   └── types.ts                # Shared TypeScript types
├── tests/
│   ├── helpers/db.ts           # Test fixtures & helpers
│   └── lib/                    # Query & mutation tests
└── docs/                       # Technical documentation
```

---

## Database Schema

The core data model:

```
users
  └── organizationMembers ──→ organizations
        └── products
              ├── assets
              │     └── assetDependencies
              └── codePlans
                    └── tasks
```

Both SQLite and Postgres schemas are maintained in parallel under `lib/db/`. Migrations live in `lib/db/migrations/{sqlite,postgres}/`.

---

## Running Tests

```bash
pnpm test              # run all tests (88 tests across 3 files)
pnpm test:watch        # watch mode
pnpm test:coverage     # with coverage report
```

Tests use an in-memory SQLite database and run in isolated forked processes.

---

## Database Scripts

```bash
pnpm db:generate       # generate migrations from schema changes
pnpm db:migrate        # apply migrations
pnpm db:push           # push schema directly (dev only)
pnpm db:studio         # open Drizzle Studio
pnpm db:seed           # create admin account + default workspace
pnpm db:seed-demo      # populate with realistic multi-user demo data
```

The seed scripts respect three optional env vars for the admin account:

```bash
SEED_ADMIN_EMAIL=admin@example.com   # default
SEED_ADMIN_PASSWORD=Password1!       # default
SEED_ADMIN_NAME=Admin                # default
SEED_ORG_NAME="My Workspace"         # default
```

---

## Demo accounts

After running `pnpm db:seed-demo`, five accounts are available:

| Name | Email | Role | Password |
|---|---|---|---|
| Alex Chen | `alex.chen@codeplans.local` | Owner | `Password1!` |
| Sarah Kim | `sarah.kim@codeplans.local` | Admin | `Password1!` |
| Mike Jones | `mike.jones@codeplans.local` | Editor | `Password1!` |
| Lisa Wang | `lisa.wang@codeplans.local` | Editor | `Password1!` |
| James Lee | `james.lee@codeplans.local` | Viewer | `Password1!` |

The demo workspace includes 3 products, 15 assets, 9 code plans, and ~65 tasks across various stages.

---

## Contributing

Contributions are welcome. To get started:

1. Fork the repo and create a feature branch
2. Make your changes — the SQLite local mode requires no cloud setup
3. Add or update tests in `tests/`
4. Open a pull request with a clear description

Please keep PRs focused. Bug fixes, test coverage improvements, and documentation updates are especially appreciated.

---

## Roadmap

- [x] Product & asset CRUD forms — shipped in v0.1.5 (side panels & quick modals)
- [x] Code Plan create/edit flows — shipped in v0.1.5
- [x] Task create/edit panel + inline status updates — shipped in v0.1.5
- [x] Team invite flow (invite, change role, remove)
- [x] **v0.2.0 — Schema foundations & single-team cleanup:** work items + plan links, per-asset plan rows (branch/PR fields), repo paths, provenance columns; default-org bootstrap, org-membership access model
- [x] **v0.2.1 — Work items & tech debt UI:** backlog views, debt register by asset/area, activity feed (event log)
- [x] **v0.2.2 — Dependency mapping & impact analysis;** analytics wired to real data
- [x] **v0.2.3 — Integrations framework** + first connector (GitHub Issues), pull-only sync
- [x] **v0.2.4 — Task-level sync & mixed plans;** PR auto-linking
- [x] **v0.2.5 — GitLab Issues connector** (incl. self-hosted instances)
- [ ] Jira / Asana / Linear connectors
- [ ] AI-assisted effort estimation

See [`docs/app-spec.md`](docs/app-spec.md) for the full current state of the app, and [`docs/specs/design-spec-v3.md`](docs/specs/design-spec-v3.md) for the target design and detailed roadmap.

---

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Sai Prakash](https://github.com/SylonZero) · [Sign up for the beta](https://codeplans.ai)
