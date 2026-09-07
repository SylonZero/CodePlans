import { migrateLegacySpecs } from '../lib/db/spec-migration'

async function main() {
  const args = process.argv.slice(2)
  const productId = args.find((a) => a.startsWith('--product='))?.slice('--product='.length)
  if (!productId || args.some((a) => a !== '--apply' && a !== '--dry-run' && !a.startsWith('--product=')) || (args.includes('--apply') && args.includes('--dry-run'))) {
    console.error('Usage: pnpm specs:migrate --product=<product-id> [--dry-run | --apply]')
    process.exit(1)
  }
  try {
    console.log(JSON.stringify(await migrateLegacySpecs(productId, { apply: args.includes('--apply') }), null, 2))
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Spec migration failed')
    process.exit(1)
  }

}
main().catch((error) => { console.error(error); process.exitCode = 1 })
