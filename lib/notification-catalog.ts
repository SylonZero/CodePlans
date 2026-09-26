// The notification event catalog: what CodePlans can tell people about, and
// the defaults an org starts with. Client-safe (no data-layer imports) so the
// settings pages can render it.

export type ChannelFlags = { inApp: boolean; email: boolean; slack: boolean }

export type EventGroup = 'reviews' | 'comments' | 'specs' | 'work' | 'plans' | 'releases' | 'workspace'

export type CatalogEntry = {
  type: string
  label: string
  description: string
  group: EventGroup
  defaults: ChannelFlags
  /**
   * People can't be left out of these in-app: they are how reviews and
   * mentions reach someone. Admins can still change email and Slack, and
   * people can still turn their own email off.
   */
  mandatory?: boolean
}

const I = { inApp: true, email: false, slack: false }
const IE = { inApp: true, email: true, slack: false }
const IS = { inApp: true, email: false, slack: true }
const IES = { inApp: true, email: true, slack: true }

export const NOTIFICATION_CATALOG: CatalogEntry[] = [
  { type: 'review.requested', group: 'reviews', label: 'Review requested', description: 'You were asked to review a spec or plan', defaults: IES, mandatory: true },
  { type: 'review.changes_requested', group: 'reviews', label: 'Changes requested', description: 'A reviewer asked for changes to your spec or plan', defaults: IE, mandatory: true },
  { type: 'review.approved', group: 'reviews', label: 'Approved', description: 'A review you asked for or authored was approved', defaults: IS },
  { type: 'review.commented', group: 'reviews', label: 'Review comment', description: 'A reviewer left a comment with their review', defaults: I },
  { type: 'review.updated', group: 'reviews', label: 'Needs another look', description: 'Something you reviewed was revised before the review finished', defaults: IE },
  { type: 'review.stale', group: 'reviews', label: 'Approval outdated', description: 'Something you approved changed after approval', defaults: IE },
  { type: 'comment.mention', group: 'comments', label: 'Mentioned', description: 'Someone @mentioned you', defaults: IE, mandatory: true },
  { type: 'comment.reply', group: 'comments', label: 'Reply', description: 'A reply in a thread you are part of', defaults: I },
  { type: 'comment.created', group: 'comments', label: 'Comment', description: 'A new comment on something you authored or own', defaults: I },
  { type: 'spec.created', group: 'specs', label: 'New spec', description: 'A spec was drafted in your area', defaults: IS },
  { type: 'spec.revised', group: 'specs', label: 'Spec revised', description: 'A spec that reaches your assets or plans has a new version', defaults: IS },
  { type: 'spec.activated', group: 'specs', label: 'Spec active', description: 'A spec that reaches your assets became active', defaults: IS },
  { type: 'spec.superseded', group: 'specs', label: 'Spec superseded', description: 'A spec that reaches your assets was superseded or archived', defaults: IS },
  { type: 'work_item.created', group: 'work', label: 'New work item', description: 'A bug, feature or tech-debt item was filed on an asset you own; imports arrive as one summary per sync', defaults: IS },
  { type: 'work_item.assigned', group: 'work', label: 'Work item assigned', description: 'You were made owner of a work item', defaults: IE },
  { type: 'task.assigned', group: 'work', label: 'Task assigned', description: 'You were assigned a task', defaults: IE },
  { type: 'plan.created', group: 'plans', label: 'Plan created', description: 'A plan was drafted in a product you manage or for your assets', defaults: I },
  { type: 'plan.activated', group: 'plans', label: 'Plan activated', description: 'A plan that targets your assets started', defaults: IS },
  { type: 'plan.completed', group: 'plans', label: 'Plan completed', description: 'A plan that targets your assets finished', defaults: IS },
  { type: 'pr.merged', group: 'plans', label: 'PR merged', description: 'A pull request on a plan you own was merged (from a connected tool)', defaults: I },
  { type: 'plan.targets_asset', group: 'plans', label: 'Plan targets your asset', description: 'An asset you own was added to a plan', defaults: I },
  { type: 'release.shipped', group: 'releases', label: 'Release shipped', description: 'A release including your assets shipped', defaults: IES },
  { type: 'capability.graduated', group: 'releases', label: 'Capability graduated', description: 'Shipped work was recorded against an asset you own', defaults: I },
  { type: 'asset.design_note', group: 'releases', label: 'Design note', description: 'A design note was added to an asset you own', defaults: I },
  { type: 'responsibility.assigned', group: 'workspace', label: 'Responsibility', description: 'You were made engineering manager or architect on a product', defaults: IE },
  { type: 'integration.error', group: 'workspace', label: 'Integration error', description: 'A connected tool failed to sync (sent to workspace admins)', defaults: IE, mandatory: true },
]

export const EVENT_GROUP_LABELS: Record<EventGroup, string> = {
  reviews: 'Reviews', comments: 'Comments', specs: 'Specs', work: 'Work items and tasks', plans: 'Plans', releases: 'Releases and asset records', workspace: 'Workspace',
}

const BY_TYPE = new Map(NOTIFICATION_CATALOG.map((e) => [e.type, e]))

export function catalogEntry(type: string): CatalogEntry | undefined {
  return BY_TYPE.get(type)
}

export const EVENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(NOTIFICATION_CATALOG.map((e) => [e.type, e.label]))
