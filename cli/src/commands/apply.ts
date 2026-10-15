import { readFileSync } from 'node:fs'
import { CliError, EXIT } from '../client.js'
import { applyManifest, validateManifest, type ApplyResult } from '../apply.js'
import { paint, printJson } from '../output.js'
import type { Command } from '../cli.js'

const MARK: Record<ApplyResult['status'], string> = { created: '+', 'would create': '+', exists: '=', failed: '!', skipped: '-' }

export const apply: Command = {
  name: 'apply',
  summary: 'Create the products, assets, dependencies and responsibilities a setup manifest describes',
  usage: 'codeplans apply <manifest.json|-> [--dry-run]',
  details: [
    'Re-running is safe: products match by slug, assets by name, dependencies by their endpoints,',
    'and responsibilities by person and role. Only what is missing is created; nothing is changed or deleted.',
    'Use --dry-run to see what would be created. See docs/guides/cli.md for the manifest format.',
  ].join('\n'),
  options: { 'dry-run': { type: 'boolean' } },
  minArgs: 1,
  async run(ctx, [file], values) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file === '-' ? 0 : file, 'utf8'))
    } catch (err) {
      throw new CliError(`Can't read ${file === '-' ? 'stdin' : file} as JSON: ${err instanceof Error ? err.message : err}`, EXIT.usage)
    }
    const manifest = validateManifest(raw)
    const dryRun = !!values['dry-run']
    const { out } = ctx
    const style = (s: ApplyResult['status']) => (s === 'failed' ? 'red' : s === 'exists' || s === 'skipped' ? 'dim' : 'green') as 'red' | 'dim' | 'green'
    const results = await applyManifest(ctx.client(), manifest, {
      dryRun,
      onResult: out.json ? undefined : (r) => out.print(paint(out, style(r.status), `${MARK[r.status]} ${r.kind.padEnd(10)} ${r.product === r.name ? r.name : `${r.product}: ${r.name}`}  ${r.status}${r.error ? ` (${r.error})` : ''}`)),
    })
    const count = (s: ApplyResult['status']) => results.filter((r) => r.status === s).length
    const failed = count('failed')
    if (out.json) printJson(out, { dryRun, results })
    else {
      out.print()
      out.print(dryRun
        ? `Dry run: ${count('would create')} to create, ${count('exists')} already there.`
        : `${count('created')} created, ${count('exists')} already there${failed ? `, ${failed} failed` : ''}${count('skipped') ? `, ${count('skipped')} skipped` : ''}.`)
    }
    if (failed) throw new CliError(`${failed} step${failed === 1 ? '' : 's'} failed.`)
  },
}
