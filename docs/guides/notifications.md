# Email and Slack notifications

Every notification lands in the bell and in [My Work](my-work.md). A workspace
can also send them by email (through [Resend](https://resend.com)) and post
them to one Slack channel (through an incoming webhook). Both need only a key or
a URL.

## Connecting channels

Workspace owners and admins open **Settings → Manage workspace notifications**
(`/settings/notifications`).

| Channel | What you enter | Notes |
|---|---|---|
| Email (Resend) | API key, a From address on a domain you verified in Resend, optional reply-to | If you leave the key out, CodePlans uses the server's `RESEND_API_KEY` |
| Slack | An incoming webhook URL, and the channel name for your reference | Create one under your Slack app's **Incoming Webhooks**. Messages go to the channel the webhook is bound to |

**Send test email** and **Send test message** send straight away and show the
provider's answer, so a wrong key or an unverified domain is visible at once.
Keys and webhook URLs are encrypted at rest (AES-256-GCM, keyed from
`AUTH_SECRET`) and never sent back to the browser. The page only shows a hint
such as `re_…abcd`. **Pause** stops a channel without forgetting it.

## Choosing events

The **Events** table lists every event with an on/off switch and a column per
channel: in-app, email and Slack. The defaults are:

| Event | In-app | Email | Slack |
|---|---|---|---|
| Review requested *(required)* | ✔ | ✔ | ✔ |
| Changes requested *(required)* | ✔ | ✔ | |
| Approved | ✔ | | ✔ |
| Needs another look, Approval outdated | ✔ | ✔ | |
| Mentioned *(required)* | ✔ | ✔ | |
| Reply, Comment, Review comment | ✔ | | |
| New spec, Spec revised, Spec active, Spec superseded | ✔ | | ✔ |
| New work item | ✔ | | ✔ |
| Work item assigned, Task assigned | ✔ | ✔ | |
| Plan activated, Plan completed | ✔ | | ✔ |
| Plan targets your asset, Capability graduated, Design note | ✔ | | |
| Release shipped | ✔ | ✔ | ✔ |
| Responsibility assigned | ✔ | ✔ | |
| Integration error *(required, admins only)* | ✔ | ✔ | |

*Required* events always reach people in-app, because reviews and mentions
depend on them. Their email and Slack columns can still be changed. The
**Agents** column decides whether an event notifies anyone when an AI agent
did it through MCP. Agent-made events are marked "by an AI agent" either way.
**Reset to defaults** restores the table above.

The table decides *whether* and *where*. *Who* is told comes from
responsibilities and involvement (code owners, architects, engineering
managers, reviewers, authors, assignees), as described in
[My Work](my-work.md). Slack gets one post per event for the whole channel.
Email goes to each person who would be told in-app.

## Personal email settings

Anyone can open **Settings → Notifications** to turn off all email, or email
for single events. This only narrows what the workspace sends. It never adds
email that admins turned off, and it never affects in-app notifications or My
Work.

## Delivery and retries

Email and Slack messages go through an outbox (`notification_deliveries`). They
are sent right after the action that caused them, without slowing it down, and
each event goes out once per person and channel. A failed send is retried
after 1, 2, 4 and 8 minutes, and after five attempts it stops. An error that
retrying can't fix (a revoked key, an unverified sender, a deleted webhook)
stops at once. **Recent deliveries** on the settings page shows each message's
status and last error. A failing channel is marked **Failing** until a send
succeeds.

Retries run from `/api/cron/notifications`:

- **Self-hosted (`HOST_MODE=team`).** The server runs the job every minute on
  its own. Set `NOTIFY_INTERVAL_SECONDS` to change the interval, or `0` to turn
  it off.
- **Everywhere else.** Set `CRON_SECRET` and call the endpoint every minute or
  few with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this
  header). Without `CRON_SECRET` the endpoint is disabled.

The same job deletes finished deliveries, and notifications marked done, after
90 days. `sync_log` remains the permanent record of what happened.

## Environment variables

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Fallback email channel when none is saved in settings |
| `RESEND_API_URL` | Send through a Resend-compatible relay instead of `api.resend.com` |
| `NOTIFY_WEBHOOK_ALLOWED_HOSTS` | Extra webhook hosts (comma-separated, e.g. a Mattermost server). By default only `https://hooks.slack.com` is accepted |
| `CRON_SECRET` | Enables `/api/cron/notifications` |
| `NOTIFY_INTERVAL_SECONDS` | Team mode's in-process retry interval (default 60, `0` to disable) |
