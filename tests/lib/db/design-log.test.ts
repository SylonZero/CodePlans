import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { getAssetHistory } from '@/lib/db/queries'
import {
  createRelease,
  updateRelease,
  setReleaseAsset,
  createDesignNote,
  updateDesignNote,
  deleteDesignNote,
} from '@/lib/db/mutations'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

describe('asset design log', () => {
  it('design notes appear in asset history with author attribution', async () => {
    await createDesignNote({
      assetId: F.assetApi,
      title: 'Retry logic moved behind the queue',
      body: 'All retries now flow through the outbox.',
      codePlanId: F.planCompleted,
      authorKind: 'agent',
      authorId: F.bob,
    })
    const entries = await getAssetHistory(F.assetApi, F.alice)
    const note = entries!.find((e) => e.kind === 'design_note')
    expect(note).toBeTruthy()
    expect(note!.title).toBe('Retry logic moved behind the queue')
    expect(note!.authorKind).toBe('agent')
    expect(note!.authorName).toBe('Bob')
    expect(note!.planTitle).toBe('Completed Plan')
  })

  it('update and delete round-trip', async () => {
    const note = await createDesignNote({ assetId: F.assetApi, title: 'Draft', authorId: F.alice })
    const updated = await updateDesignNote(note.id, { title: 'Final', body: 'done' })
    expect(updated!.title).toBe('Final')
    await deleteDesignNote(note.id)
    const entries = await getAssetHistory(F.assetApi, F.alice)
    expect(entries!.some((e) => e.kind === 'design_note')).toBe(false)
  })
})

describe('release stamps in asset history', () => {
  it('shipped releases produce version tick marks; unshipped do not', async () => {
    const release = await createRelease({ productId: F.productShared, name: 'API v3' }, F.alice)
    await setReleaseAsset(release.id, F.assetApi, { version: 'v3.0.0' })

    let entries = await getAssetHistory(F.assetApi, F.alice)
    expect(entries!.some((e) => e.kind === 'release_stamp')).toBe(false)

    await updateRelease(release.id, { status: 'shipped' })
    entries = await getAssetHistory(F.assetApi, F.alice)
    const stamp = entries!.find((e) => e.kind === 'release_stamp')
    expect(stamp).toBeTruthy()
    expect(stamp!.version).toBe('v3.0.0')
    expect(stamp!.releaseId).toBe(release.id)
    expect(stamp!.title).toBe('API v3')
  })
})
