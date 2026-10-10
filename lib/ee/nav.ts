// Helpers for rendering `NavExtension` items in the dashboard sidebar.

/**
 * Whether an extension nav item points outside the app (an absolute http or
 * https URL, e.g. a hosted billing portal). The sidebar opens these in a new
 * tab; in-app paths like "/audit-log" navigate in place.
 */
export function isExternalNavHref(href: string): boolean {
  return /^https?:\/\//i.test(href)
}
