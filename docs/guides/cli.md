# Command-line tool

`codeplans` is CodePlans in your terminal. Use it to check what's waiting on
you, script workspace setups, and drive plans, tasks and work items from shell
scripts and CI.

It talks to the same [MCP endpoint](ai-agents.md) your coding agents use,
with an API key, so every rule in the app applies unchanged: org access, the
review workflow, and protected fields on mirrored issues. Anything the CLI
has no command for is one `codeplans call` away.

## Install

The CLI needs Node.js 20 or later and has no other dependencies.

```bash
npm install -g @codeplans/cli
codeplans --version
```

Or run it without installing: `npx @codeplans/cli status`.

## Connect

Create an API key in **Settings → API Keys**. Read keys cover the read
commands, and the commands that change things need a write key. Then:

```bash
codeplans login --url https://acme.codeplans.app --key cpk_…
codeplans status
```

`login` checks the key before saving it to `~/.config/codeplans/config.json`
(or `$XDG_CONFIG_HOME/codeplans/config.json`). That file is readable only by
you.

### Profiles

Save more than one connection with `--profile`. The last one you log in to
becomes the current one.

```bash
codeplans login --url http://localhost:3000 --key cpk_… --profile local
codeplans products --profile local
codeplans logout --profile local
```

### Environment variables (CI)

In CI you don't need a config file at all. Set both of these:

| Variable | Meaning |
|---|---|
| `CODEPLANS_URL` | The address you open CodePlans at |
| `CODEPLANS_API_KEY` | An API key |
| `CODEPLANS_PROFILE` | Use this saved profile instead of the current one |

`CODEPLANS_URL` and `CODEPLANS_API_KEY` win over the config file when both
are set, unless you pass `--profile`.

URLs must use `https://`. Plain `http://` is accepted only for `localhost`.

## Commands

Run `codeplans help` for the list and `codeplans <command> --help` for one
command's options. Products can be given by slug, name or id.

### Reading

| Command | What it shows |
|---|---|
| `codeplans me [--product <slug>]` | Reviews waiting on you, your assignments, overdue tasks and work in flight |
| `codeplans products` | Products with asset, plan and work item counts |
| `codeplans product <slug>` | A product's assets and dependencies |
| `codeplans plans [--product] [--status] [--type]` | Plans with progress |
| `codeplans plan <planId>` | A plan's tasks, target assets with branches and PRs, and linked work items |
| `codeplans items [--product] [--type] [--status] [--severity] [--tag] [--plan] [--limit] [--cursor]` | Work items. When there are more, it prints the `--cursor` for the next page |
| `codeplans search <words…> [--type]… [--product] [--limit]` | Text search across products, assets, plans, tasks, work items, specs and releases |
| `codeplans tools` | Every MCP tool the server offers |

### Changing things (write key)

| Command | What it does |
|---|---|
| `codeplans plan create --product <slug> --title <t> [--type] [--asset <name>]… [--item <id>]… [--description … \| --description-file <path\|->] [--tag]… [--owner <email>] [--deadline <date>]` | Creates a draft plan. Assets are given by name |
| `codeplans plan activate <planId>` | Moves a draft plan to active |
| `codeplans plan complete <planId>` | Marks a plan completed |
| `codeplans task add <planId> <title…> [--priority] [--assignee <email>] [--description]` | Adds a task. Re-adding the same title does nothing, so scripts can run again |
| `codeplans task start\|done\|reset <taskId>` | Sets a task's status |
| `codeplans item add --product <slug> --title <t> --type <type> [--severity] [--asset <name>] [--area] [--description] [--tag]…` | Files a work item |
| `codeplans item status <itemId> <status>` | Sets a work item's status: `open`, `planned`, `in_progress`, `resolved` or `wont_do` |
| `codeplans apply <manifest.json\|-> [--dry-run]` | Sets up products, assets, dependencies and responsibilities; see below |
| `codeplans call <tool> [--arg key=value]… [--input <file.json\|->]` | Calls any MCP tool and prints its JSON result |

If your workspace uses the **Gated** review workflow, `plan activate` and
`task start` fail with the server's message until the plan's review is
approved. Nothing is bypassed.

### `call`: everything else

`codeplans tools` lists the tools. `call` passes arguments with `--arg`; values
are read as JSON when they parse, otherwise as text:

```bash
codeplans call get_tech_debt_register --arg productId=… --arg limit=10
codeplans call update_plan_asset --arg id=… --arg prUrl=https://github.com/acme/web/pull/42 --arg prStatus=open
echo '{"query":"billing","limit":5}' | codeplans call search --input -
```

## Output and scripting

- Add `--json` to any command for the server's JSON, ready for `jq`:

  ```bash
  codeplans plans --status active --json | jq -r '.[].title'
  ```

- Tables are aligned plain text. Colour is used only on a terminal, and never
  when `NO_COLOR` is set.
- Errors go to stderr, so a script can tell output from failure.

| Exit code | Meaning |
|---|---|
| `0` | Success |
| `1` | The server refused or the command failed (for example a validation or review-workflow error) |
| `2` | Usage mistake: unknown command or option, or a bad value |
| `3` | Not connected, unreachable, or the API key was refused |

## Setting up a workspace with `apply`

`apply` reads a manifest describing products, their assets, the dependencies
between them, and who is responsible for what. It creates whatever is
missing. Running it again is safe:

- products match by slug (made from the name unless you give one);
- assets match by name within their product, ignoring case;
- dependencies match by their two assets and type;
- responsibilities match by person, role and area.

`apply` never changes or deletes anything that already exists. Preview with
`--dry-run`:

```bash
codeplans apply workspace.json --dry-run
codeplans apply workspace.json
```

```text
+ product    payments: Payments  created
+ asset      payments: Payments API  created
= asset      payments: Ledger DB  exists
+ dependency payments: Payments API → Ledger DB  created
+ person     payments: lisa@acme.com (architect, payments)  created

4 created, 1 already there.
```

If one step fails, `apply` reports it and carries on with the rest, then exits
with `1`.

### Manifest format

```json
{
  "products": [
    {
      "name": "Payments",
      "slug": "payments",
      "description": "Card and bank payments",
      "tags": ["fintech"],
      "assets": [
        { "name": "Payments API", "type": "service", "layer": "backend",
          "repositoryUrl": "https://github.com/acme/platform", "repoPath": "services/payments",
          "owners": ["mike@acme.com"] },
        { "name": "Ledger DB", "type": "datastore", "layer": "data" },
        { "name": "Checkout Web", "type": "app", "layer": "frontend" }
      ],
      "dependencies": [
        { "from": "Payments API", "to": "Ledger DB" },
        { "from": "Checkout Web", "to": "Payments API", "type": "integrates_with" }
      ],
      "people": [
        { "email": "sarah@acme.com", "responsibility": "eng_manager" },
        { "email": "lisa@acme.com", "responsibility": "architect", "area": "payments" }
      ]
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `products[].name` | yes | |
| `products[].slug` | no | Defaults to the name in lowercase with dashes |
| `products[].description`, `tags` | no | Used only when the product is created |
| `assets[].name` | yes | |
| `assets[].type` | yes | `app`, `service`, `library`, `datastore` or `platform` |
| `assets[].layer`, `description`, `tags`, `repositoryUrl`, `repoPath`, `documentationUrl` | no | Used only when the asset is created |
| `assets[].owners` | no | Code owners by email, set when the asset is created |
| `dependencies[].from`, `to` | yes | Asset names in the same product |
| `dependencies[].type` | no | `depends_on` (default), `integrates_with` or `aggregates` |
| `people[].email` | yes | A member of the workspace |
| `people[].responsibility` | yes | `eng_manager`, `architect` or `contributor` |
| `people[].area` | no | Scopes the responsibility to an area |

A dependency can point at an asset that already exists in the product, even
if the manifest doesn't list it. `apply -` reads the manifest from stdin.

## Recipes

Check what's waiting on you when a shell opens. Add this to `~/.zshrc`:

```bash
codeplans me 2>/dev/null
```

Open a plan and its tasks from a script:

```bash
plan=$(codeplans plan create --product payments --title "Retry failed payouts" \
  --asset "Payments API" --description-file plan.md --json | jq -r .id)
codeplans task add "$plan" "Add retry queue" --priority high
codeplans task add "$plan" "Alert on repeated failures"
codeplans plan activate "$plan"
```

File a work item from CI when a check finds debt:

```bash
codeplans item add --product payments --type tech_debt --severity low \
  --title "Upgrade node-fetch in Payments API" --asset "Payments API" --tag deps
```
