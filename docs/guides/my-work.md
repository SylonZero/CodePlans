# My Work and notifications

My Work is your inbox for engineering work. It is built from your
responsibilities (see [Reviews and comments](reviews-and-comments.md)): the
products where you are an engineering manager, architect or contributor, the
assets you own, and the tasks, plans and specs that are yours.

## Three bands

**Needs you** lists things blocked on your action. Each item starts with a verb
and shows why it is yours (for example *code owner · API Gateway*).

| Item | When it appears |
|---|---|
| Review / Look again | You're a reviewer who hasn't decided, or the content changed since you did |
| Address feedback | A review you asked for, or of something you own, has changes requested |
| Reply / Pick up / Acknowledge | You were mentioned, someone replied in your thread, or work or a responsibility was assigned to you |
| Triage | Open work with no owner and no plan, on an asset you own or a product you manage |
| Add evidence | A delivery record is incomplete and you can fix it (see below) |
| Overdue | A task assigned to you is past its end date |

Items that came from notifications can be marked **Done** or **snoozed** for a
day or a week. The others clear themselves once you act: deciding a review,
setting an owner, adding the missing PR.

**In flight** shows your tasks grouped by plan — with the plan's specs, whether
an approval covers them, a warning when a spec changed after the plan started,
and each asset's PR status — plus plans you own and specs you're writing.

**Watching** lists changes to things you're responsible for: new work on your
assets, spec revisions, plans that target your assets, releases shipped.

## Lenses

If you hold more than one responsibility, **View as** switches between
Developer, Code owner, Architect and Eng manager. A lens puts its items first
(nothing that needs you is hidden) and adds panels:

| Lens | Panels |
|---|---|
| Code owner | Assets you own; capabilities delivered against an older spec version than the approved one |
| Architect | Reviews in your area; plans with the most coordination (assets, repositories, dependencies between them); active specs linked to nothing |
| Eng manager | Plans at risk (deadline within a week with open tasks); release readiness (open plans, assets missing a version); work merged or completed but not shipped |

## Evidence gaps

CodePlans never infers that something was delivered. When the record is
incomplete, it asks the person who can complete it:

| Gap | Routed to |
|---|---|
| A completed plan with an asset that never recorded a PR | Plan owner |
| An upcoming release with an asset missing a version stamp | That asset's code owners and the product's engineering managers |
| A resolved feature not graduated into its asset's record after a week | The asset's code owners |
| An active plan built on a spec that has changed since its last approval | Plan owner and the product's architects |
| An active spec with no approval covering it, in a guided product | Spec author |

## Notifications

The bell in the header shows unread notifications. Each one says why you
received it, and nobody is notified about their own actions. People are told
about review requests and outcomes, mentions and replies, spec changes that
touch their assets or approvals, new work on their assets, assignments, plan
activation and completion, releases shipped, graduations and new
responsibilities.

Agents can read the same inbox with `get_my_work` and `list_notifications`,
and clear handled items with `mark_notifications_done`.
