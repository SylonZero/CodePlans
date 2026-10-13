# Agent Skills

CodePlans publishes a set of agent skills: short instructions that teach a
coding agent the CodePlans workflows (model a repo, read an asset's story
before changing it, log the work, keep specs current, close plans, ship
releases). They use the [MCP server](ai-agents.md), so the agent needs a
CodePlans API key either way.

The skills live in [`plugins/codeplans/skills`](../../plugins/codeplans/skills)
and follow the open [Agent Skills](https://agentskills.io) format, so they
work in Claude Code, Codex, Cursor, GitHub Copilot and other agents that
support it.

## Install

### Claude Code: the plugin (recommended)

The plugin installs every skill and connects the MCP server for you:

```text
/plugin marketplace add SylonZero/CodePlans
/plugin install codeplans@codeplans
```

From a shell, the same commands are `claude plugin marketplace add
SylonZero/CodePlans` and `claude plugin install codeplans@codeplans`.

Claude Code then asks for two settings: your **CodePlans URL** (for example
`https://acme.codeplans.app` or `http://localhost:3000`, with no trailing
slash) and an **API key** from **Settings → API Keys**. The key is stored as
a secret, not in your settings file. Change them later with `/plugin configure
codeplans@codeplans`, and get updates with `/plugin marketplace update
codeplans`.

If you already added the server with `claude mcp add`, you can keep that and
install only the skills with the command below; installing the plugin as
well would connect a second copy of the server.

### Any agent: `npx skills`

```sh
npx skills add SylonZero/CodePlans
```

The [`skills`](https://github.com/vercel-labs/skills) tool asks which skills
and which agents to install for, then copies them into the agent's skills
folder (`.claude/skills/`, `.agents/skills/` and so on). Useful options:

| Option | Effect |
|---|---|
| `--list` | Show the skills without installing |
| `--skill codeplans-log` | Install one skill (repeat for more) |
| `-a claude-code` | Install for one agent |
| `-g` | Install for your user rather than this project |

This installs the skills only. Connect the MCP server yourself as described
in [Connecting](ai-agents.md#connecting); the **Settings → API Keys** page has
a snippet for each agent.

## The skills

| Skill | Use it to |
|---|---|
| `/codeplans-model` | Inventory a repo or monorepo and model it as a product, assets and dependency edges. Proposes only the delta, so it's safe to re-run. See [Modeling Monorepos](modeling-monorepos.md). |
| `/codeplans-context` | Before a change, read what CodePlans knows about the assets involved: owners, dependents, history, design notes, specs, debt and open issues. Read-only. |
| `/codeplans-log` | At the end of a session, record the plan, tasks, branch and PR status, and the debt and follow-ups found. Updates an existing plan rather than duplicating it. See [Logging Work](logging-work.md). |
| `/codeplans-spec` | Read, create, revise or supersede a spec and link it to assets, work items and plans. See [Native Specs](using-specs.md). |
| `/codeplans-close-plan` | Complete a finished plan, record design notes on the changed assets (revising linked specs), and graduate delivered features into the asset record. |
| `/codeplans-release` | Create a release, attach its plans, stamp asset versions and ship it. See [Releases & Versions](releases-and-versions.md). |
| `/codeplans-my-work` | Show what's waiting on you and pick the next thing to do. |
| `/codeplans-capture` | Import an existing docs folder as plans, work items and native specs. See [Capturing a Docs Corpus](capturing-docs.md). |

Agents also pick a skill on their own when a request matches its description,
so "log this in CodePlans" runs `/codeplans-log` without the slash command.

Every skill that writes asks before the steps people would want to check:
`/codeplans-model` and `/codeplans-capture` propose changes before making
them, and `complete_plan` and `ship_release` always need your go-ahead.

## Customising

The skills are plain markdown. To adapt one (say, the docs layout table in
`/codeplans-capture`), install it with `npx skills add` and edit the copy in
your agent's skills folder, or fork the repository and point the commands
above at your fork.

## For contributors

`tests/plugins/codeplans.test.ts` checks that every skill's frontmatter is
valid, that each skill names only MCP tools the server registers, and that the
two manifests agree. When you rename or remove an MCP tool, update the skills
in the same change. Run `claude plugin validate .` to check the manifests the
way Claude Code reads them.
