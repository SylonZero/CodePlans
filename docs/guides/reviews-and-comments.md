# Reviews and comments

CodePlans lets the people responsible for an asset agree on intent before
work starts, and keeps the conversation next to the spec or plan it is about.

## Responsibilities decide who is asked

Each product's **People & reviews** tab records engineering managers,
architects (optionally for one area, matching a spec's `area`) and
contributors. Code owners are set per asset. Responsibilities route reviews;
they never change permissions, which come from the workspace role.

| Subject | Suggested reviewers | Required by default |
|---|---|---|
| Spec | Architects whose area matches the spec's (or who cover the whole product); code owners of every asset the spec reaches, directly or through its plans and work items | Yes |
| Plan | Code owners of each target asset | Yes |
| Plan | The product's engineering managers | No |

The person requesting a review is never suggested.

## A review approves a version

A review is opened on the subject's current version (a spec's `version`, a
plan's `revision`). Reviewers approve, request changes (with a note) or comment.

- While the review is open, only decisions that cover the current content
  count. If the author revises the spec, earlier decisions show as "needs
  another look" and the review returns to *In review*.
- The review is **approved** when every required reviewer approves the current
  content (with no required reviewers, everyone on it counts as required). Any
  required reviewer requesting changes puts it in *Changes requested*.
- Once approved, a later content change marks the approval **outdated**. A
  status-only change, such as activating the approved spec, does not.
- A plan's revision moves when its targets, addressed work items, linked specs
  or description change.
- Requesting a review moves a draft spec to *in review*; withdrawing returns it
  to draft. Superseding a spec closes its open review.
- Agents can comment and request reviews but cannot record a decision.

When a feature is graduated into an asset record, the capability pins the
latest approved spec version if the current text has not been approved, so
the record says which agreed intent the work delivered. You can also choose
the version explicitly.

## Workflow levels

| Level | Behaviour |
|---|---|
| **Open** (default) | Anyone with edit access can request a review and pick reviewers; nothing waits on one. |
| **Guided** | Suggested reviewers are always added and required. Activating a spec or plan that no approval covers asks for confirmation. |

Org owners and admins set the workspace default in **Settings**; org admins
and a product's engineering managers can override it per product. Stricter
enforcement can be added through the `reviewGate` extension hook (see
[Enterprise extension points](enterprise-extensions.md)).

## Comments

Specs, plans, work items, releases and assets have a **Discussion** panel.
Comments can be marked as a question or a suggestion, mention people with `@`,
and be resolved. Anyone who can see the subject can comment, including
viewers. On a spec, select text and choose **Comment on selection** to quote
it; if a later version removes that text, the comment is shown as outdated
with the version it was written on.

## For agents (MCP)

| Tool | Purpose |
|---|---|
| `list_comments`, `add_comment`, `resolve_comment` | Read and take part in discussions |
| `request_review`, `list_reviews`, `get_review` | Open reviews and follow their state |

There is deliberately no tool to approve a review.
