// The intake migration turns existing imported work items into external
// reports: acted-on ones accepted, closed ones declined, the rest untriaged.
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

const dir = mkdtempSync(join(tmpdir(), 'intake-backfill-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const SRC = join(process.cwd(), 'lib/db/migrations/sqlite')
const INTAKE_TAG = readdirSync(SRC).find((f) => /_work_item_intake\.sql$/.test(f))!.replace(/\.sql$/, '')

/** A copy of the migrations folder that stops just before the intake migration. */
function migrationsBeforeIntake() {
  const out = join(dir, 'before')
  cpSync(SRC, out, { recursive: true })
  const journalPath = join(out, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < INTAKE_TAG)
  writeFileSync(journalPath, JSON.stringify(journal))
  return out
}

describe('intake migration backfill', () => {
  it('classifies existing imported items and leaves native ones alone', async () => {
    const client = createClient({ url: `file:${join(dir, 'db.sqlite')}` })
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: migrationsBeforeIntake() })

    const now = Math.floor(Date.now() / 1000)
    const item = (id: string, source: string, status: string, externalKey: string | null = null) =>
      client.execute({ sql: `INSERT INTO work_items (id, product_id, type, title, status, source, external_key, created_at, updated_at) VALUES (?, 'p1', 'bug', ?, ?, ?, ?, ?, ?)`, args: [id, id, status, source, externalKey, now, now] })
    await client.execute('PRAGMA foreign_keys = OFF')
    await item('gh-open', 'github', 'open')                 // unlinked, open → untriaged
    await item('gh-linked', 'github', 'open')               // linked to a plan, open → accepted
    await item('gh-spec', 'gitlab', 'open')                 // linked to a spec, open → accepted
    await item('gh-progress', 'jira', 'in_progress')        // acted on → accepted
    await item('gh-done', 'github', 'resolved')             // done → accepted
    await item('gh-wontdo', 'github', 'wont_do')            // closed → declined
    await item('native-plain', 'native', 'open')            // untouched
    await item('native-keyed', 'native', 'open', 'forum:1') // external key → untriaged
    await client.execute({ sql: `INSERT INTO work_item_code_plans (id, work_item_id, code_plan_id, created_at) VALUES ('l1', 'gh-linked', 'plan-1', ?)`, args: [now] })
    await client.execute({ sql: `INSERT INTO spec_links (id, spec_id, target_type, target_id, created_at) VALUES ('s1', 'spec-1', 'work_item', 'gh-spec', ?)`, args: [now * 1000] })

    await migrate(db, { migrationsFolder: SRC })
    const rows = (await client.execute('SELECT id, origin, triage_state, triage_note, triaged_by_kind, triaged_at, status FROM work_items')).rows
    const by = Object.fromEntries(rows.map((r) => [r.id as string, r]))
    expect(by['gh-open']).toMatchObject({ origin: 'external', triage_state: 'untriaged', triage_note: null, triaged_at: null })
    for (const id of ['gh-linked', 'gh-spec', 'gh-progress', 'gh-done']) {
      expect(by[id]).toMatchObject({ origin: 'external', triage_state: 'accepted', triaged_by_kind: 'system' })
      expect(by[id].triaged_at).toBeTruthy()
    }
    expect(by['gh-linked'].triage_note).toMatch(/linked to a plan or spec/)
    expect(by['gh-wontdo']).toMatchObject({ triage_state: 'declined', status: 'wont_do' })
    expect(by['native-plain']).toMatchObject({ origin: 'internal', triage_state: null })
    expect(by['native-keyed']).toMatchObject({ origin: 'external', triage_state: 'untriaged' })
    client.close()
  })
})
