# Collaboration Loop v1 — Responsibilities, Review, My Work, and Notifications

## TL;DR

CodePlans records *what* changed and *why*, but not *who is expected to act next*. This spec closes the engineering loop around assets with four connected pieces:

1. **Responsibilities, not job titles.** Keep the org role (`owner | admin | editor | viewer`) as the *permission* axis. Add a separate, *scoped* responsibility axis: engineering manager and architect per product (new `product_members`), code owner per asset (existing `asset_owners`), and developer, which follows from task assignment and plan ownership. Responsibilities decide routing, review defaults, and what shows up in My Work. They never grant permissions.
2. **Review as an attestation on a pinned revision.** A review request targets `(spec, version)` or `(plan, revision)`, not the mutable record. An approval of v3 says nothing about v4. When a spec is revised, earlier approvals become *stale*. Nothing silently carries them forward. This is the same pinning rule deliveries already follow, applied to review. Comments are threaded, can be anchored to text, and are pinned to the version they were written against. Reviews cover specs **and plans**. Plan review happens before any effort is spent, so it is the cheapest point to stop a misdirected change. Admins pick a workflow level per product: **Open** (default) or **Guided**. Stricter enforcement can be supplied through a narrow extension hook.
3. **My Work becomes a role-aware inbox.** It has three bands (*Needs you*, *In flight*, *Watching*), and each item says *why you are seeing it* ("you own `auth-service`"). The default lens depends on the user's responsibilities. The header bell, which is currently inert, reads from the same notification store.
4. **An event catalog with admin-configured delivery.** Domain events go out through one outbox to in-app, email (Resend), and Slack. Admins choose which events are on and whether each goes to email, a Slack webhook, or both. Users can mute *email* for non-mandatory events. Credentials are an API key or webhook URL, encrypted with the existing `lib/integrations/secrets.ts`.

Build order: foundations (authz enforcement, event emission, spec revision bodies) → comments and review → the My Work inbox and bell → email and Slack webhook.

## Source / Context

### What the code has today

| Area | Current state | Consequence |
|---|---|---|
| My Work | `app/(dashboard)/my-work/page.tsx` shows four lists: open tasks assigned to me, plans I own, work items I own, and assets I own (`getOwnedAssets`, which ignores product scope). | It is a list of *things I own*, not *things waiting on me*. It has no review queue, no feedback, and no "why". |
| Roles | `organization_members.role` is `owner/admin/editor/viewer`. `authz.ts` only gates deletes. `inviteMemberAction` and integration creation have no role check, and `viewer` is not blocked from writing anywhere. | The permission model exists on paper only. Review and notification config need real enforcement first. |
| Ownership | `asset_owners` ("declared responsibility, like code owners, not an ACL"), `codePlans.ownerId`, `workItems.ownerId/reporterId`, `tasks.assigneeId`. No `product_members`. | Code owner and developer already exist implicitly. Engineering manager and architect don't exist at all. |
| Specs | Status is `draft/active/archived/superseded`. `reviseSpec` bumps `version` with CAS. `needsReview` is an **import-quality** flag set only by the git migration. `spec_events` has no actor. Spec changes are not written to `sync_log`. Old bodies are not retained. | The wiki's "Specs needing review" view is really an *import-triage* view. Nobody can review a revision, because the revision's content isn't kept. |
| Comments | None. The only "comment" code writes back to external trackers (`lib/integrations/writeback.ts`). | There is no feedback channel inside CodePlans. |
| Events | `sync_log` via `logAudit` (about 51 call sites, never throws) feeds the activity feed and asset history. `logAudit` resolves the org from `users.organizationId`, the *current-org pointer*. | This is a usable event source, but it must key off the *entity's* product and org, or notifications for multi-org users will route to the wrong org. |
| Delivery | `lib/email.ts` uses Resend for verification and invite emails only (env `RESEND_API_KEY`). There are no webhooks and no cron; sync is manual. The header Bell button has no handler. | No notification pipeline exists yet, and there is no org-level settings storage (`organizations` has no config column). |

### Why this matters for the model

CodePlans captures artifacts, but not the process that makes a claim trustworthy: who reviewed the intent, against which revision, and who was told.

- **Review is the missing attestation for intent.** An approval pinned to `(spec, version)` records which revision was the agreed intent when a plan started. It also gives graduation something better than "the current version at graduation time."
- **Responsibilities give the actor meaning.** "Approved by the asset's code owner" is a stronger claim than "approved by someone." Recording the responsibility the actor held *at the time* (not just their user id) keeps that claim historically honest.
- **Notifications and My Work keep the record complete.** A loop that asks the right person for missing evidence at the right time (for example, "plan completed without a PR link on `billing-api`") is how the model stays complete without heroics.

## Approach

### 1. Responsibilities

Two independent axes:

| Axis | Values | Scope | Decides |
|---|---|---|---|
| **Org role** (exists) | `owner`, `admin`, `editor`, `viewer` | Organization | What you *can* do: write, configure, invite, delete |
| **Responsibility** (new + existing) | `eng_manager`, `architect`, `code_owner`, `developer` | Product or asset | What you are *expected* to do: review, triage, be notified, see in My Work |

Keep them separate. A staff engineer can be the architect of one product and a developer on another. A contractor can be a code owner while being an `editor`. Making "architect" an org role would force one global answer to a scoped question.

**Where each responsibility lives:**

| Responsibility | Storage | Scope | Notes |
|---|---|---|---|
| Engineering manager | `product_members.responsibility = 'eng_manager'` | Product | Several per product allowed |
| Architect | `product_members.responsibility = 'architect'`, optional `area` | Product (optionally per `area`, matching `specs.area`) | Area scoping lets a schema architect differ from a UX lead |
| Code owner | `asset_owners` (exists) | Asset | No schema change |
| Developer | Derived: `tasks.assigneeId`, `codePlans.ownerId`, plus optional `product_members.responsibility = 'contributor'` | Plan/task, optionally product | Explicit membership is only needed for "watch this product" routing |

```ts
product_members: {
  id, productId, userId,
  responsibility: 'eng_manager' | 'architect' | 'contributor',
  area: string | null,        // architects only; null = whole product
  createdAt, createdById, createdByKind,
  // unique (productId, userId, responsibility, area)
}
```

**How each role acts on the model.** Each responsibility maps to the transitions it is expected to *attest*, which is what makes the roles meaningful rather than decorative:

| Transition in the model | Primary actor | Also involved |
|---|---|---|
| Demand arrives (work item created or imported) → triaged (owner set, linked to a plan or `wont_do`) | Eng manager | Code owner of `workItems.assetId` |
| Intent drafted (spec `draft`) → reviewed → `active` | Spec author (any) | Architect (area match) is a required reviewer; code owners of linked assets are suggested reviewers |
| Plan drafted → `active` (a coordinated change is agreed) | Plan owner | Code owners of each `targets` asset review impact; eng manager is auto-added under Guided |
| Tasks executed, PR evidence attached per asset | Developer (assignee) | Code owner reviews the PR in Git; CodePlans only mirrors `prStatus` |
| Spec revised while plans or receipts reference an older version | Spec author | Everyone who approved the prior version, plus owners of affected plans |
| Release declared `shipped` with version stamps | Eng manager | Code owners confirm stamps for their assets |
| Capability graduated (receipt) | Code owner or eng manager | Records the approved `(s, v)` and the attesting responsibility |

**Prerequisite fixes** (separate PRs, needed before any of this is trustworthy):

- Enforce `viewer` as read-only in server actions, API routes and MCP write tools, through one `assertCanWrite(userId, productId)` in `lib/db/authz.ts`.
- Restrict `inviteMemberAction`, integration management, and notification settings to `owner`/`admin`.
- `logAudit` should resolve the org from the *entity's product*, not `users.organizationId`.

### 2. Feedback: comments

```ts
comments: {
  id, productId,
  subjectType: 'spec' | 'code_plan' | 'work_item' | 'release' | 'asset',
  subjectId,
  subjectVersion: number | null,   // spec.version at time of writing; null for unversioned subjects
  parentId: string | null,         // one level of threading (GitHub-style)
  anchor: json | null,             // { quote, prefix, suffix, headingPath } for inline spec comments
  body,                            // GFM
  kind: 'comment' | 'suggestion' | 'question',
  authorId, authorType: 'user' | 'agent',
  resolvedAt, resolvedById,
  createdAt, editedAt, deletedAt,
}
comment_mentions: { commentId, userId }   // parsed @mentions → notifications
```

- **Anchoring:** inline comments store the quoted text plus its context, not character offsets. After a revision they are re-matched: an exact match stays anchored, and anything else shows as **outdated (v3)**, collapsed under the spec like GitHub's outdated diff comments. The history is never lost.
- **Agents** can read threads and reply (MCP: `list_comments`, `add_comment`, `resolve_comment`). They are labeled `authorType: 'agent'`, so human and agent contributions stay distinguishable. This lets an agent address review feedback on a spec it drafted.
- **Tracker boundary:** comments are native CodePlans records. Work items mirrored from Jira or Linear keep the tracker authoritative for their own discussion. CodePlans comments on those items are engineering annotations and are not written back, except through the existing narrow write-back path if a future setting allows it.

### 3. Review

#### 3a. Keep the spec's revision bodies

A review of v3 is meaningless if v3's text is gone. Add:

```ts
spec_revisions: { specId, version, title, body, createdAt, createdById, createdByKind, // PK (specId, version)
                  changeSummary: string | null }
```

`reviseSpec` writes the outgoing body inside its existing CAS transaction. Pinned revision numbers become recoverable documents, and the spec page gains diffs (v2 → v3).

#### 3b. Review requests and decisions

```ts
reviews: {
  id, productId,
  subjectType: 'spec' | 'code_plan',
  subjectId,
  subjectVersion,                  // pinned; for plans, a plan revision counter (see below)
  requestedById, requestedAt,
  dueAt: string | null,
  state: 'open' | 'approved' | 'changes_requested' | 'withdrawn' | 'stale',
  closedAt,
}
review_participants: {
  reviewId, userId,
  reason: 'architect' | 'code_owner' | 'eng_manager' | 'requested',  // the responsibility held at request time
  required: boolean,
  decision: 'pending' | 'approved' | 'changes_requested' | 'commented',
  decidedAt, decidedAtVersion,
}
```

**Rules:**

- **Pinning:** a decision records `decidedAtVersion`. If the spec is revised while the review is open, the review stays open, decisions on older versions show as "approved v3 — now at v4", and required approvers are asked to re-review. If the spec is revised after the review has closed as approved, a new review is *not* opened automatically. The old review is marked `stale` and the spec shows "last approved: v3". Current intent and approved intent stay distinguishable.
- **Suggested reviewers:** architects whose `area` matches `specs.area` (or has none), the code owners of every asset linked via `spec_links`, and the eng managers of the product for plans. The requester can edit the list. Code owners and the architect are *required* participants by default.
- **State:** `approved` when every required participant approved at the current version. `changes_requested` when any required participant requested changes at the current version.
- **Spec status:** add `in_review` to the spec status union (`draft → in_review → active`). Requesting a review moves `draft` to `in_review`. Approval moves it to `active` if the product's workflow settings say so (see 3c); otherwise the author activates it.
- **Plans:** plans have no version today. Add `codePlans.revision`, bumped on changes to scope (targets and addresses), linked specs, or description. Plan review answers "do the owners of these assets agree to this coordinated change?". It is a **core** review subject, not an add-on. PR review in Git happens after the work exists. Plan review happens *before* any effort is spent, which is the cheapest point to catch a change heading in the wrong direction. That matters more when agents implement plans: an unreviewed plan can burn substantial tokens and engineer time before anyone objects.
- **Agents** can request reviews and comment, but **cannot approve**. Approval is a human attestation. This is a deliberate provenance rule, not a missing feature.
- **Graduation:** when a capability is graduated, default the pinned spec version to the *latest approved version linked to the origin plan*, not simply the current version. Show the choice explicitly.

#### 3c. Workflow levels: admin controls that stay simple

Small teams must not have to run a review process to use CodePlans. Admins pick **one workflow level per product** (with an org default):

| Level | Behaviour |
|---|---|
| **Open** (default) | No approvals required. Anyone can request a review, and reviews work fully (pinned version, stale detection), but nothing waits on them. |
| **Guided** | Reviewers are auto-added from responsibilities (code owners of a plan's target assets, the architect for a spec's area). Pending reviews appear in *Needs you*. Activating an unapproved spec or plan shows a warning but is allowed. |

```ts
// product_settings (new; org default in org_settings)
workflow: { level: 'open' | 'guided' }
```

**Extension hook.** Every activation path (server actions, the API, and the MCP tools, including task pickup) calls `getEnterpriseHooks().reviewGate({ subjectType, subjectId, transition, actorId, actorKind })`. The community default returns `{ allowed: true }`. An extension may return `{ allowed: false, reasons: [...] }`, which the caller surfaces verbatim. This follows the existing `lib/ee` rule of narrow hooks that return serializable data.

**Split the two meanings of "review" in the wiki:**

- `needsReview` → rename it in the UI to **"Needs triage (imported)"**. Keep the column, since this is a data-quality signal.
- New **"Awaiting review"** view: specs with an open `reviews` row. This is what the wiki mock already implies, and the main app gains the same list at `/specs?view=review`. Add the missing Specs list page, which currently exists only as `/specs/[id]`.

### 4. My Work as a role-aware inbox

#### Structure

Three bands, in order:

1. **Needs you.** Things blocked on *your* action. Every item has a verb.
   - Review requests where I'm a pending participant, sorted by required first, then due date, then age.
   - "Changes requested" on specs or plans I authored or own.
   - Unresolved comment threads mentioning me or replying to me.
   - Triage: work items on my assets or products that have no owner and no plan (eng manager, code owner).
   - Evidence gaps I'm responsible for (see below).
   - Overdue tasks assigned to me.
2. **In flight.** My current commitments. This is roughly today's page, reorganized.
   - Tasks grouped by plan, each plan showing its **pinned spec revision** and the per-asset `prStatus`, so a developer sees "working against Auth Spec v4 (approved)".
   - Plans I own, with review state and deadline risk.
   - Specs I'm authoring (`draft` or `in_review`) with reviewer progress (2/3 approved).
3. **Watching.** Changes to things I'm responsible for but didn't cause. These are informational, and it's fine to collapse them by default.
   - New work items, plans, and spec revisions touching my assets.
   - Dependency changes (`asset_dependency`) on my assets.
   - Releases shipped containing my assets.

Each item carries a **reason chip** ("code owner · `auth-service`", "architect · schema", "mentioned") and **actions**: open, done, snooze (1 day, 1 week), and mute this thread.

#### Lenses

A lens tab bar sits at the top. It defaults to the user's strongest responsibility in the current product scope, and users can switch lenses. Lenses reorder and filter items; they do not hide *Needs you* items.

| Lens | Emphasis | Extra panels |
|---|---|---|
| **Developer** | My tasks by plan, pinned spec version, PR status, feedback on my work | "Spec changed since your plan started" warning |
| **Code owner** | Impact on my assets: plans and specs targeting them, untriaged demand, review requests | The Assets I Own table (existing) with open items, tech debt, and **delivered-but-stale**: capabilities pinned to an older spec version than the current approved one |
| **Architect** | Review queue across my product/area, specs with drift, cross-asset plans | Plans ranked by coordination burden (number of assets, repositories, and dependencies); active specs with no asset links |
| **Eng manager** | Triage queue, plans at risk, release readiness | Release readiness: plans in the release not completed, assets missing version stamps, **merged-but-not-shipped** plans |

#### Evidence gaps (missing evidence, made actionable)

These are derived checks that produce *Needs you* items for the responsible person, never an inferred success:

| Gap | Routed to |
|---|---|
| Plan `completed` with an asset whose `prStatus` is `none` | Plan owner |
| Release `in_progress` near its date with an asset missing a version stamp | Eng manager, then the code owner of that asset |
| Resolved feature/enhancement on an asset, not graduated after N days | Code owner |
| Active plan referencing a spec that has been revised past the approved version | Plan owner and architect |
| Active spec with no approved revision, in a Guided product | Spec author |

#### Implementation: derived vs stored

- **State items** (my tasks, my plans, triage, evidence gaps) are **derived by query** each time, as today. Nothing to keep in sync.
- **Event items** (a mention, a review request, "changes requested") are **stored** in `notifications`, so they can be read, done, or snoozed:

```ts
notifications: {
  id, userId, eventId,               // eventId → sync_log.id (the source event)
  eventType, productId, subjectType, subjectId,
  reason,                            // 'code_owner:asset:<id>' | 'mentioned' | 'reviewer' | ...
  title, summary,                    // rendered at creation for stable display
  readAt, doneAt, snoozedUntil,
  createdAt,
}
```

The Bell shows the unread count and the latest ten notifications. My Work's *Needs you* band merges stored notifications that are not done with derived state items.

Fix `getOwnedAssets` so it respects `productAccessWhere` and the product scope, like every other My Work query.

### 5. Notification events

#### Event pipeline

```
mutation ─► logAudit (sync_log row, now with productId + actorKind) ─► after() dispatch
                                                                     │
                   recipients = rules(eventType, subject, responsibilities, watchers) − actor
                                                                     │
               ┌───────────────── notifications (in-app, per user) ◄┤
               │                                                     ├► notification_deliveries (email, per user)
               │                                                     └► notification_deliveries (slack webhook)
               ▼
   /api/cron/notifications  (retries; also runs opportunistically on request)
```

- **One source of truth:** extend `sync_log` rather than inventing a parallel bus. Add `productId` and `actorKind` (`user|agent|connector`), and emit spec, review and comment events there too; spec changes are missing from it today. `spec_events` stays as the per-asset history snapshot.
- **Dispatch:** there is no cron today, so use Next 16's `after()` to dispatch once the response is sent. A `/api/cron/notifications` route handles retries; it is callable by Vercel Cron, a system cron, or a `HOST_MODE=team` interval in `instrumentation.ts`.
- **Idempotency:** `notification_deliveries` is unique on `(eventId, channelId, target)`, with `status`, `attempts`, `lastError`, `sentAt`, and up to five attempts with exponential backoff. Delivery must never fail the originating mutation, matching `logAudit`'s never-throw contract.
- **Self-suppression:** the actor is never notified of their own action.
- **Connector noise:** events caused by an integration sync (`actorKind: 'connector'`) are batched per sync run into one summary notification ("Jira sync: 14 new work items on 3 assets you own"), never one per item.
- **Agent events:** allowed, but marked in the payload ("🤖 spec drafted by agent via MCP"). Admins can mute them per event type.

#### Event catalog (v1)

Default channels are **I** = in-app, **E** = email, **S** = Slack (webhook channel).

| Event | Trigger | Default recipients | Default channels | Mandatory* |
|---|---|---|---|---|
| `review.requested` | Review opened or reviewer added | Participants | I, E, S | ✔ |
| `review.changes_requested` | Participant requests changes | Requester, spec author/plan owner | I, E | ✔ |
| `review.approved` | Review reaches `approved` | Requester, author, eng managers | I, S | |
| `review.stale` | Approved subject revised | Prior approvers, owners of linked active plans | I, E | |
| `comment.mention` | @mention | Mentioned user | I, E | ✔ |
| `comment.reply` | Reply in a thread I'm in | Thread participants | I | |
| `comment.created` | New top-level comment | Subject author/owner | I | |
| `spec.created` | New spec | Architects (area), code owners of linked assets | I, S | |
| `spec.revised` | `reviseSpec` | Code owners of linked assets, owners of plans linking it, prior approvers | I, S | |
| `spec.activated` / `spec.superseded` | Status change | Code owners of linked assets | I, S | |
| `work_item.created` | New native or imported item (batched for sync) | Code owners of `assetId`, eng managers | I, S | |
| `work_item.assigned` | `ownerId` set to me | New owner | I, E | |
| `plan.created` / `plan.activated` | New or activated plan | Code owners of target assets, eng managers | I, S | |
| `plan.completed` | Plan completed | Eng managers, code owners of targets | I, S | |
| `task.assigned` | `assigneeId` set to me | Assignee | I, E | |
| `pr.merged` | `prStatus → merged` (from sync) | Plan owner | I | |
| `release.shipped` | Release shipped | Product members, code owners of included assets | I, E, S | |
| `evidence.gap` | Evidence gap detected (section 4) | Responsible user | I | |
| `capability.graduated` | Receipt created | Code owners, architects | I | |
| `integration.error` | Sync failure / connection `status = 'error'` | Org admins | I, E | ✔ |

\* *Mandatory* events can't be muted by users for **in-app**. Users can still turn email off.

Each Slack and email message is rendered from the same template: a subject link, the actor, a one-line summary, and (for email) the "why" reason. For review events, the pinned version appears in the text ("Auth Spec v4").

### 6. Admin configuration

A new admin-only settings page, **Settings → Notifications**, with two sections.

**Channels.** Secrets are stored with `lib/integrations/secrets.ts` (AES-256-GCM, keyed off `AUTH_SECRET`). The env var fallback is kept, like `integrations.authRef`.

| Provider | What the admin enters | Notes |
|---|---|---|
| **Email (Resend)** | API key, from address (verified domain), optional reply-to | Falls back to env `RESEND_API_KEY` / `RESEND_FROM_EMAIL`, so self-hosted setups keep working. Include "Send test email". |
| **Slack (incoming webhook)** | Webhook URL | Posts to the one channel the webhook is bound to. Include "Send test message". |

```ts
notification_channels: {
  id, organizationId,
  kind: 'email_resend' | 'slack_webhook',
  name, config: json,                 // { fromAddress } | { channelLabel }
  secretEncrypted, authRef,           // same pattern as integrations
  status: 'active' | 'paused' | 'error', lastError, lastUsedAt,
  createdAt, createdById,
}
```

**Events.** One row per event type, with defaults from the catalog: an on/off toggle and checkboxes for **In-app / Email / Slack**, plus toggles for agent-originated and connector-originated events.

```ts
notification_rules: { id, organizationId, eventType, enabled, inApp, email, slack }
org_settings: { organizationId, workflowDefault, ... }   // first org-level config storage
```

**User preferences** (Settings → Profile → Notifications): email on/off per event type, and mute a product or asset.

```ts
notification_preferences: { userId, eventType, email: boolean | null }
```

Resolution order is admin rule (enabled, channels) → user preference (only narrows, never widens) → mandatory flags.

### 7. MCP / agent surface

Agents are first-class consumers of the loop:

- **`get_my_work`**: the same bands as the UI, so an agent session can start with "what's waiting on me?".
- **Review and comment tools:** `request_review`, `list_reviews`, `list_comments`, `add_comment`, `resolve_comment`. There is deliberately no `approve_review`.
- **Spec-body tool:** `get_spec_revision(specId, version)`, which returns historical bodies.

## Phasing

| Phase | Scope |
|---|---|
| **0: Foundations** | Enforce `viewer`; admin-gate invites and integrations; `logAudit` keyed to the product's org, with `productId`/`actorKind`; spec events into `sync_log` with actor; `spec_revisions`; `product_members` plus a UI on the product page; Specs list page |
| **1: Feedback and review** | `comments` (+ anchors, mentions); `reviews`/`review_participants` for specs and plans; `codePlans.revision`; `in_review` status; review panels; workflow levels Open/Guided; `reviewGate` hook; wiki split (triage vs awaiting review); MCP tools |
| **2: My Work and in-app** | `notifications` table; dispatcher via `after()`; Bell dropdown; My Work bands, lenses and reason chips; evidence-gap checks; `getOwnedAssets` scope fix |
| **3: Email and Slack webhook** | Resend and webhook channels in settings, per-event toggles, user email opt-out, templates |

Each phase is shippable on its own.

## Decisions made

1. **Approval is never required by default.** Products start at **Open**.
2. **Plan review is core.** Code owners review a plan before effort starts, because that is the cheapest point to stop a misdirected change; PR review in Git comes after the cost is paid.

## Open questions

1. **Retention:** how long to keep `notifications` and `notification_deliveries`. The proposal is 90 days for delivered rows, with `sync_log` remaining the permanent record.
