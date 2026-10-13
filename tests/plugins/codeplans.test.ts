// The published agent skills (plugins/codeplans) must stay installable and must
// only name MCP tools the server actually registers.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../..')
const pluginDir = path.join(root, 'plugins/codeplans')
const skillsDir = path.join(pluginDir, 'skills')
const route = readFileSync(path.join(root, 'app/api/mcp/[transport]/route.ts'), 'utf8')

const registeredTools = new Set([...route.matchAll(/server\.tool\(\s*'([a-z_]+)'/g)].map((m) => m[1]))
const skills = readdirSync(skillsDir).map((name) => ({ name, text: readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8') }))

/** Reads `key: value` frontmatter, rejecting anything a strict YAML parser would read differently. */
function frontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) throw new Error('missing frontmatter')
  return Object.fromEntries(match[1].split('\n').map((line) => {
    const m = line.match(/^([a-z-]+): (.+)$/)
    if (!m) throw new Error(`unsupported frontmatter line: ${line}`)
    // An unquoted ": " or " #" in a value changes its meaning in YAML.
    if (/: | #|^["'[{>|&*!%@`]/.test(m[2])) throw new Error(`value needs rewording for YAML: ${line}`)
    return [m[1], m[2]]
  }))
}

// Backticked snake_case words that start like a tool name; leaves enum values such as `tech_debt` alone.
const TOOL_LIKE = /`((?:get|list|create|update|delete|link|unlink|add|remove|record|graduate|attach|detach|set|ship|activate|complete|supersede|mark|import|triage|archive|restore|move|assign|resolve|request)_[a-z_]+|search)[`(]/g

describe('codeplans plugin', () => {
  it('finds the MCP tools in the route', () => {
    expect(registeredTools.size).toBeGreaterThan(50)
    expect(registeredTools).toContain('get_my_work')
  })

  it('has valid manifests that agree with each other', () => {
    const plugin = JSON.parse(readFileSync(path.join(pluginDir, '.claude-plugin/plugin.json'), 'utf8'))
    const marketplace = JSON.parse(readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'))
    const entry = marketplace.plugins.find((p: { name: string }) => p.name === plugin.name)
    expect(entry).toBeDefined()
    expect(path.resolve(root, entry.source)).toBe(pluginDir)
    expect(plugin.mcpServers.codeplans.url).toBe('${user_config.api_url}/api/mcp/mcp')
    expect(plugin.userConfig.api_key.sensitive).toBe(true)
  })

  it.each(skills)('$name has frontmatter matching its folder', ({ name, text }) => {
    const meta = frontmatter(text)
    expect(Object.keys(meta).sort()).toEqual(['description', 'name'])
    expect(meta.name).toBe(name)
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(meta.description.length).toBeLessThanOrEqual(1024)
  })

  it.each(skills)('$name only names registered MCP tools', ({ text }) => {
    const named = [...text.matchAll(TOOL_LIKE)].map((m) => m[1])
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter((tool) => !registeredTools.has(tool))).toEqual([])
  })

  it.each(skills)('$name only points to skills that exist', ({ text }) => {
    const referenced = [...text.matchAll(/`\/(codeplans-[a-z-]+)`/g)].map((m) => m[1])
    expect(referenced.filter((skill) => !existsSync(path.join(skillsDir, skill)))).toEqual([])
  })
})
