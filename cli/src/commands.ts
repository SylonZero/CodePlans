import type { Command } from './cli.js'
import { login, logout, status } from './commands/auth.js'
import { me, products, product, plans, plan, items, search, tools } from './commands/read.js'
import { planCreate, planActivate, planComplete, taskAdd, taskStart, taskDone, taskReset, itemAdd, itemStatus, call } from './commands/write.js'
import { apply } from './commands/apply.js'

/** Every command, in the order help lists them. */
export const COMMANDS: Command[] = [
  login, logout, status,
  me, products, product,
  plans, plan, planCreate, planActivate, planComplete,
  taskAdd, taskStart, taskDone, taskReset,
  items, itemAdd, itemStatus,
  search, apply, tools, call,
]
