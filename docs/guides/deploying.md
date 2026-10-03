# Deploying CodePlans

CodePlans ships as one Docker image that runs on Railway, Fly.io, Render or
any Docker host. The image is the same whichever database you use: it picks
SQLite or Postgres from `DATABASE_URL`, applies migrations when it starts, and
lets you create the first account in the browser. There's no shell step.

## Choose a database

| | SQLite (default) | Postgres |
|---|---|---|
| Best for | One team; the cheapest, simplest setup | Larger teams, managed backups, more than one instance |
| What you add | A small volume (1 GB is plenty) mounted at `/data` | A Postgres database: Railway Postgres, Fly Managed Postgres, Neon, Supabase, … |
| How CodePlans picks it | Leave `DATABASE_URL` unset | Set `DATABASE_URL=postgres://…` |
| Instances | Exactly one | Any number |
| Deploys | A few seconds of downtime while the volume moves to the new machine | No downtime |
| Backups | Volume snapshots (Fly takes them daily; Railway has volume backups) | Your provider's |

There's no way yet to move an instance from SQLite to Postgres. If you expect
to need Postgres, start with it.

**The database never lives in the image.** A new deploy builds a new image
and starts a new container, but the SQLite file is on the volume, which stays
across deploys. The new version runs any new migrations on the existing data.
Without a volume, `/data` would be part of the container and would be thrown
away on every deploy. So on Railway, Fly.io and Render, CodePlans refuses to
start on SQLite unless the database folder is on a mounted volume, and its log
says how to attach one. For a throwaway trial without a volume, set
`ALLOW_EPHEMERAL_DB=true`. Expect to lose everything on each deploy.

`DATABASE_URL` decides everything:

| `DATABASE_URL` | Database |
|---|---|
| unset | SQLite at `$DATA_DIR/codeplans.db` (`/data` in the image) |
| `postgres://…` or `postgresql://…` | Postgres |
| `file:/path/to/codeplans.db` | SQLite at that path |
| `libsql://…` | A hosted libSQL server such as Turso (set `DATABASE_AUTH_TOKEN`); no volume needed |

For Postgres, TLS is on for hosted providers and off for private-network hosts
(`*.railway.internal`, `*.flycast`, `*.internal`, `localhost`, Docker service
names). `sslmode=` in the URL or `DB_SSL=true|false` overrides this.

## Railway

1. Fork the repository, then in Railway choose **New Project → Deploy from
   GitHub repo** and pick your fork. Railway reads `railway.json` and builds
   the Dockerfile.
2. Pick a database:
   - **SQLite:** right-click the service → **Attach volume**, mount path `/data`.
   - **Postgres:** **+ New → Database → PostgreSQL**. Then add a variable on
     the CodePlans service: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
3. Add the variable `AUTH_SECRET` with the output of `openssl rand -base64 32`.
   SQLite installs can skip this: one is generated on the volume.
4. **Settings → Networking → Generate Domain.** CodePlans reads Railway's
   domain, so `AUTH_URL` doesn't need setting.
5. Deploy, then open the domain and follow [first sign-in](#first-sign-in).

Railway checks `/api/health` before switching traffic to a new deploy.

## Fly.io

```bash
git clone https://github.com/SylonZero/CodePlans.git && cd CodePlans
fly launch --copy-config --no-deploy   # choose an app name and region
fly secrets set AUTH_SECRET=$(openssl rand -base64 32)
fly deploy
fly logs                                # find the [setup] line
```

`fly.toml` runs SQLite on a volume called `codeplans_data` at `/data`, on one
machine that stops when idle and starts on the next request. If `fly deploy`
says the volume is missing, create it with
`fly volumes create codeplans_data --size 1 --region <region>`. Keep SQLite
apps at one machine (`fly scale count 1`).

**Postgres on Fly:** delete the `[[mounts]]` section from `fly.toml`. Create a
database with `fly mpg create`, then run `fly mpg attach <cluster> -a <app>`,
which sets `DATABASE_URL`. For any other provider, run
`fly secrets set DATABASE_URL=postgres://…`. Deploy again. With Postgres you
can run more than one machine.

CodePlans uses `https://<app>.fly.dev` as its URL. Set `AUTH_URL` once you
add a custom domain.

## Any Docker host

```bash
docker build -t codeplans .
docker run -d -p 3000:3000 -v codeplans-data:/data codeplans   # SQLite
```

With Postgres:

```yaml
# compose.yaml
services:
  codeplans:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://codeplans:codeplans@db:5432/codeplans
      AUTH_SECRET: change-me-to-32-random-bytes-base64
      AUTH_URL: http://localhost:3000
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: codeplans
      POSTGRES_PASSWORD: codeplans
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "codeplans"]
      interval: 5s
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes:
  pgdata:
```

Behind your own reverse proxy, set `AUTH_URL` to the public URL.

## First sign-in

A new instance has no accounts. The first time it starts, it logs a line like
this:

```
[setup] No accounts yet. Open https://codeplans.up.railway.app/setup and enter the setup code: K7QM-4XZP-W2HD
```

Open `/setup`, which is also where any page redirects you. Enter the code,
your name, email and password, and optionally a workspace name. That creates
the owner account and signs you in. After that `/setup` is closed. Only
someone who can read the server log can claim the instance, because the code
is derived from `AUTH_SECRET`. It's the same on every restart and on every
instance.

To skip the browser step, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 8
characters; optionally `ADMIN_NAME`) before the first start. CodePlans creates
the owner from them on boot while the instance is empty, and ignores them
afterwards.

Registration is closed by default. Invite people from the **Team** page.

## Updating

Redeploy the new version. Pending migrations run before the server accepts
requests. On Postgres an advisory lock makes sure only one starting machine
migrates. If a migration fails, the server logs the reason and exits instead
of serving a half-migrated database, so the platform keeps the previous
deploy running. Take a backup or snapshot before upgrading across releases.

To run migrations yourself instead, set `MIGRATE_ON_BOOT=false` and run
`pnpm db:migrate` from a checkout. Either way the applied migrations are
recorded in the same table.

A database created with `drizzle-kit push` has no migration history, and the
server refuses to start on one. Run `pnpm db:migrate` against it once, or
keep `MIGRATE_ON_BOOT=false`.

## Health check

`GET /api/health` returns `{"status":"ok","version":"…","database":"sqlite"}`,
or HTTP 503 if the database can't be reached. It needs no sign-in. Railway,
Fly and the image's Docker `HEALTHCHECK` all use it.

## Settings reference

Everything is optional except where noted. Explicit values always win over
what CodePlans works out.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | SQLite under `DATA_DIR` | See [Choose a database](#choose-a-database) |
| `DATA_DIR` | `/data` in the image, `data` otherwise | Where the SQLite file (and a generated `AUTH_SECRET`) live |
| `AUTH_SECRET` | generated for SQLite | **Required for Postgres.** Signs sessions and encrypts stored integration tokens, so keep it stable |
| `AUTH_URL` | from Railway, Fly or Render | Public URL; set it for custom domains |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | — | Create the owner on first boot |
| `MIGRATE_ON_BOOT` | on in production | `false` to manage migrations yourself |
| `ALLOW_EPHEMERAL_DB` | — | `true` lets SQLite run on Railway, Fly.io or Render without a volume (data is lost on every deploy) |
| `DB_SSL` | from the URL and host | `true` / `false` to force Postgres TLS |
| `DATABASE_AUTH_TOKEN` | — | For `libsql://` (Turso) URLs |
| `HOST_MODE` | `team` | `saas` is for the multi-tenant hosted setup |
| `REGISTRATION` | `closed` in team mode | `open` lets anyone who reaches the server sign up |
| `PORT` | `3000` | Railway sets it for you |

Email and Slack are set up in the app; see [notifications](notifications.md).
Connect AI agents at `https://<your-domain>/api/mcp`; see [AI agents](ai-agents.md).
