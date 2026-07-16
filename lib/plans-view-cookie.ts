export const PLANS_VIEW_COOKIE = 'plans_view'
export type PlansView = 'card' | 'list'

export function parsePlansView(value: string | undefined): PlansView {
  return value === 'list' ? 'list' : 'card'
}
