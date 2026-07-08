import type { Connector } from './types'
import { githubConnector } from './github'

const connectors: Record<string, Connector> = {
  github: githubConnector,
}

export function getConnector(provider: string): Connector | null {
  return connectors[provider] ?? null
}

export function availableProviders(): string[] {
  return Object.keys(connectors)
}
