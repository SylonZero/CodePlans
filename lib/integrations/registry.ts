import type { Connector } from './types'
import { githubConnector } from './github'
import { gitlabConnector } from './gitlab'

const connectors: Record<string, Connector> = {
  github: githubConnector,
  gitlab: gitlabConnector,
}

export function getConnector(provider: string): Connector | null {
  return connectors[provider] ?? null
}

export function availableProviders(): string[] {
  return Object.keys(connectors)
}
