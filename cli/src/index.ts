#!/usr/bin/env node
import { run } from './cli.js'
import { COMMANDS } from './commands.js'

// Output piped into head, grep -m and the like: stop quietly when the reader goes away.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => { if (err.code === 'EPIPE') process.exit(0); throw err })
}

run(process.argv.slice(2), COMMANDS).then((code) => { process.exitCode = code })
