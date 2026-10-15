# Reviews and comments

CodePlans lets the people responsible for an asset agree on intent before
work starts, and keeps the conversation next to the spec or plan it is about.

## Responsibilities decide who is asked

Each product's **People & reviews** tab records engineering managers,
architects (optionally for one area, matching a spec's `area`) and
contributors. Code owners are set per asset. Responsibilities route reviews;
they never change permissions, which come from the workspace role.

Because code owners decide who must review a change, only an org owner or
admin, or the product's engineering manager, can change them, as with the
product's other responsibilities. Whoever creates an asset can name its first
owners. Every owner added or removed is recorded in the asset's activity, and
people are told when they become a code owner.

| Subject | Suggested reviewers | Required by default |
|---|---|---|
| Spec | Architects whose area matches the spec's (or who cover the whole product); code owners of every asset the spec reaches, directly or through its plans and work items | Yes |
| Plan | Code owners of each target asset | Yes |
| Plan | The product's engineering managers | No |

The person requesting a review is never suggested. Reviewers need edit access
to the product: viewers can comment but aren't asked to review and can't
record a decision.

## A review approves a version

A review is opened on the subject's current version (a spec's `version`, a
plan's `revision`). Reviewers approve, request changes (with a note) or comment.

- While the review is open, only decisions that cover the current content
  count. If the author revises the spec, earlier decisions show as "needs
  another look" and the review returns to *In review*.
- The review is **approved** when every required reviewer approves the current
  content (with no required reviewers, everyone on it counts as required). Any
  required reviewer requesting changes puts it in *Changes requested*.
- Once approved, a later content change marks the approval **outdated**.
  Status and details changes don't create versions at all, so activating the
  approved spec keeps both its version number and its approval. The spec page
  offers **Activate v*n*** as soon as the review is approved.
- A plan's revision moves when its targets, addressed work items, linked specs
  or description change.
- Requesting a review moves a draft spec to *in review*; withdrawing returns it
  to draft. Superseding a spec closes its open review.
- Agents can comment and request reviews but cannot record a decision.
- Any reviewer's change request shows up in the author's and requester's My
  Work as **Address feedback**, including an optional reviewer's, which doesn't
  change the review's state.

## Managing a review

The person who requested a review, the author of the spec or plan, the
product's engineering managers and org owners or admins can add or remove
reviewers and withdraw it (withdrawing asks for confirmation). Reviewers can't
reshape the review they're judging. People added to an open review are
notified.

A review always keeps at least one reviewer; withdraw it instead. In a Guided
or Gated product, reviewers made required by a responsibility can't be
removed; change the responsibility or the workflow to change who reviews.

When a feature is graduated into an asset record, the capability pins the
latest approved spec version if the current text has not been approved, so
the record says which agreed intent the work delivered. You can also choose
the version explicitly.

## Workflow levels

| Level | Behaviour |
|---|---|
| **Open** (default) | Anyone with edit access can request a review and pick reviewers; nothing waits on one. |
| **Guided** | Suggested reviewers are always added and required. Activating a spec or plan that no approval covers asks for confirmation. |
| **Gated** | As Guided, but nothing goes ahead without an approval of the current version: a spec or plan can't be activated, and a plan's tasks can't be started, until one covers it. |

Org owners and admins set the workspace default in **Settings**; org admins
and a product's engineering managers can override it per product.

In a **Gated** product the rule holds everywhere: the app, the API and agents
over MCP. A blocked activation or task start explains itself in one place:
which version needs an approval, the last approved version, who still has to
approve it, and a button to request (or go to) the review. A Guided product
shows the same notice as a warning, with **Activate anyway**.

- **Activation.** A spec or plan becomes active only when an approval covers
  its current version. Editing it in the same change (a new spec body or plan
  scope) counts as unapproved, since nobody has reviewed the new version.
- **Task starts.** Moving a task out of *Not started*, to In progress or
  Done, needs an approval covering the plan's current revision. This also
  catches plans activated before the product became Gated, and plans whose
  scope changed after approval: work already under way can finish, but new
  work waits for re-approval. Moving a started task onto another plan counts
  as starting it there. Tasks mirrored from a tracker follow the tracker.
- **A team of one.** Nobody can approve their own change, except when no one
  else with edit access can see the product: then requesting a review makes
  you the reviewer (shown as *Self-review*), so you can approve it yourself.
  Once a teammate joins, reviews go to them as usual.
- **Getting unstuck.** There is no override. An org admin or the product's
  engineering manager can switch the product to Guided, which is recorded in
  its activity.

Extensions can add rules of their own through the `reviewGate` hook, or
limit which levels are offered (see
[Enterprise extension points](enterprise-extensions.md)).

## Comments

Specs, plans, work items, releases and assets have a **Discussion** panel.
Comments can be marked as a question or a suggestion, mention people with `@`,
and be resolved. Anyone who can see the subject can comment, including
viewers. On a spec, select text and choose **Comment on selection** to quote
it; if a later version removes that text, the comment is shown as outdated
with the version it was written on.

Comments and review notes are written in markdown and shown formatted:
headings, numbered and bulleted lists, bold and italic, inline code and code
blocks, links and tables. This suits the structured feedback agents tend to
post. Raw HTML is never rendered, and `@` mentions are still highlighted.

## For agents (MCP)

| Tool | Purpose |
|---|---|
| `list_comments`, `add_comment`, `resolve_comment` | Read and take part in discussions |
| `request_review`, `list_reviews`, `get_review` | Open reviews and follow their state |

There is deliberately no tool to approve a review.
