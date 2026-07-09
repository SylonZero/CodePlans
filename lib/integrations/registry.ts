import type { Connector } from './types'
import { githubConnector } from './github'
import { gitlabConnector } from './gitlab'
import { jiraConnector } from './jira'
import { asanaConnector } from './asana'
import { linearConnector } from './linear'

const connectors: Record<string, Connector> = {
  github: githubConnector,
  gitlab: gitlabConnector,
  jira: jiraConnector,
  asana: asanaConnector,
  linear: linearConnector,
}

export function getConnector(provider: string): Connector | null {
  return connectors[provider] ?? null
}

export function availableProviders(): string[] {
  return Object.keys(connectors)
}
