import { AsyncLocalStorage } from 'node:async_hooks'
import type { Client, InStatement, Transaction, TransactionMode } from '@libsql/client'

// libsql opens new connections without a busy timeout (0), so this has to be
// re-applied to each one, not just the first.
export const BUSY_TIMEOUT_PRAGMA = 'PRAGMA busy_timeout=5000'

/** Thrown when code inside db.transaction() writes through `db` instead of `tx`. */
export class NestedWriteError extends Error {
  constructor() {
    super('Write through db inside db.transaction(); use the transaction (tx) passed to the callback')
    this.name = 'NestedWriteError'
  }
}

/**
 * Lets one write at a time run against a local SQLite file.
 *
 * libsql's local driver runs each statement synchronously, but a transaction
 * spans awaits. While one is open it holds the file's write lock on its own
 * connection, so a write that arrives meanwhile fails with SQLITE_BUSY, or,
 * with a busy timeout, blocks the event loop the transaction needs in order
 * to finish. Queueing writes behind open transactions avoids both. Reads
 * don't queue: WAL lets them run beside a writer.
 */
export class WriteQueue {
  private tail: Promise<void> = Promise.resolve()
  private readonly scope = new AsyncLocalStorage<{ open: boolean }>()

  /** Runs fn once every write queued before it has finished. */
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /** Runs a whole transaction as one queued write. */
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction()) return Promise.reject(new NestedWriteError())
    return this.run(() => {
      const state = { open: true }
      return this.scope.run(state, async () => {
        try {
          return await fn()
        } finally {
          // Work started inside the callback that outlives it queues normally.
          state.open = false
        }
      })
    })
  }

  inTransaction(): boolean {
    return this.scope.getStore()?.open === true
  }
}

const isRead = (stmt: InStatement) => /^\s*select\b/i.test(typeof stmt === 'string' ? stmt : stmt.sql)

/**
 * Sends a local libsql client's writes through `queue` and keeps the busy
 * timeout set on the connections libsql opens after each transaction.
 * db.transaction() must go through queue.transaction() (see lib/db/index.ts);
 * the client's own transaction() then runs inside that queued slot.
 */
export function queueWrites(client: Client, queue: WriteQueue): Client {
  const execute = client.execute.bind(client) as (...args: unknown[]) => ReturnType<Client['execute']>
  const batch = client.batch.bind(client)
  const migrate = client.migrate.bind(client)
  const executeMultiple = client.executeMultiple.bind(client)
  const transaction = client.transaction.bind(client) as (mode?: TransactionMode) => Promise<Transaction>

  const write = <T>(fn: () => Promise<T>): Promise<T> =>
    queue.inTransaction() ? Promise.reject(new NestedWriteError()) : queue.run(fn)

  Object.assign(client, {
    execute: (...args: unknown[]) =>
      isRead(args[0] as InStatement) ? execute(...args) : write(() => execute(...args)),
    batch: (stmts: Parameters<Client['batch']>[0], mode?: Parameters<Client['batch']>[1]) =>
      mode === 'read' ? batch(stmts, mode) : write(() => batch(stmts, mode)),
    migrate: (stmts: Parameters<Client['migrate']>[0]) => write(() => migrate(stmts)),
    executeMultiple: (sql: string) => write(() => executeMultiple(sql)),
    transaction: (mode?: TransactionMode) => {
      // Hands the current connection to the transaction and drops it from the
      // client, synchronously. The execute below then opens the replacement
      // connection and sets its busy timeout before anything else can use it.
      const tx = transaction(mode)
      execute(BUSY_TIMEOUT_PRAGMA).catch(() => {})
      return tx
    },
  })
  return client
}
