// Register tsx as a CommonJS loader so that require('./schema.sqlite')
// inside lib/db/index.ts can resolve .ts files at test time.
import 'tsx/cjs'
