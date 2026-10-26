import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { maskKey, normalizeUrl, readConfig, resolveConnection, writeConfig } from '../src/config'

const dirs: string[] = []
const tempFile = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'codeplans-cli-'))
  dirs.push(dir)
  return path.join(dir, 'codeplans', 'config.json')
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('normalizeUrl', () => {
  it('keeps https and trims trailing slashes', () => {
    expect(normalizeUrl('https://acme.codeplans.app/')).toBe('https://acme.codeplans.app')
  })
  it('allows http only for localhost', () => {
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(() => normalizeUrl('http://example.com')).toThrow(/https/)
    expect(() => normalizeUrl('not a url')).toThrow(/isn't a URL/)
  })
})

describe('maskKey', () => {
  it('shows only the ends of a key', () => {
    expect(maskKey('cpk_1234567890abcdef')).toBe('cpk_12…cdef')
    expect(maskKey('short')).toBe('••••')
  })
})

describe('config file', () => {
  it('is written readable only by its owner', () => {
    const file = tempFile()
    writeConfig({ current: 'default', profiles: { default: { url: 'https://a.test', key: 'cpk_x' } } }, file)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(readConfig(file).current).toBe('default')
  })

  it('reads as empty when missing', () => {
    expect(readConfig(tempFile())).toEqual({ profiles: {} })
  })
})

describe('resolveConnection', () => {
  const file = () => {
    const f = tempFile()
    writeConfig({ current: 'work', profiles: { work: { url: 'https://work.test', key: 'cpk_work' }, home: { url: 'https://home.test', key: 'cpk_home' } } }, f)
    return f
  }

  it('prefers the environment when both variables are set', () => {
    const conn = resolveConnection({}, { CODEPLANS_URL: 'https://env.test', CODEPLANS_API_KEY: 'cpk_env' }, file())
    expect(conn).toMatchObject({ url: 'https://env.test', key: 'cpk_env', source: 'env' })
  })

  it('uses the current profile, or the one named', () => {
    const f = file()
    expect(resolveConnection({}, {}, f)).toMatchObject({ url: 'https://work.test', profile: 'work' })
    expect(resolveConnection({ profile: 'home' }, {}, f)).toMatchObject({ key: 'cpk_home', profile: 'home' })
    expect(resolveConnection({}, { CODEPLANS_PROFILE: 'home' }, f)).toMatchObject({ profile: 'home' })
  })

  it('lets --profile win over the environment', () => {
    const conn = resolveConnection({ profile: 'home' }, { CODEPLANS_URL: 'https://env.test', CODEPLANS_API_KEY: 'cpk_env' }, file())
    expect(conn.source).toBe('profile')
  })

  it('explains how to connect when nothing is set up', () => {
    expect(() => resolveConnection({}, {}, tempFile())).toThrow(/codeplans login/)
    expect(() => resolveConnection({ profile: 'nope' }, {}, file())).toThrow(/Profiles: work, home/)
  })
})
