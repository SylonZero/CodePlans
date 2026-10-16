// Human-readable output: aligned columns, light colour on a TTY (never with
// NO_COLOR), relative dates. --json bypasses all of this.
import type { Env } from './config.js'

export type Out = {
  json: boolean
  print: (line?: string) => void
  error: (line: string) => void
  color: boolean
}

/** Anything output can go to: process.stdout/stderr, or a test double. */
export type Sink = { write: (chunk: string) => unknown; isTTY?: boolean }

export function createOut(json: boolean, stream: Sink = process.stdout, err: Sink = process.stderr, env: Env = process.env): Out {
  const color = !json && !!stream.isTTY && !env.NO_COLOR && env.TERM !== 'dumb'
  return {
    json,
    color,
    print: (line = '') => { stream.write(`${line}\n`) },
    error: (line) => { err.write(`${line}\n`) },
  }
}

const codes = { bold: [1, 22], dim: [2, 22], red: [31, 39], green: [32, 39], yellow: [33, 39], cyan: [36, 39] } as const
export type Style = keyof typeof codes

export function paint(out: Pick<Out, 'color'>, style: Style, text: string): string {
  if (!out.color) return text
  const [open, close] = codes[style]
  return `\u001b[${open}m${text}\u001b[${close}m`
}

const ANSI = /\u001b\[[0-9;]*m/g
const visible = (s: string) => s.replace(ANSI, '').length

/** Columns padded to their widest cell; the last column isn't padded. */
export function table(rows: string[][], headers?: string[], out?: Pick<Out, 'color'>): string[] {
  const all = headers ? [headers.map((h) => (out ? paint(out, 'dim', h) : h)), ...rows] : rows
  if (!all.length) return []
  const widths = all[0].map((_, i) => Math.max(...all.map((r) => visible(r[i] ?? ''))))
  return all.map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : cell + ' '.repeat(widths[i] - visible(cell)))).join('  ').trimEnd())
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.round((now - t) / 1000)
  if (s < 0) return new Date(iso).toISOString().slice(0, 10)
  if (s < 60) return 'just now'
  const units: [number, string][] = [[60, 'm'], [3600, 'h'], [86400, 'd'], [604800, 'w']]
  let label = ''
  for (const [size, unit] of units) if (s >= size) label = `${Math.floor(s / size)}${unit} ago`
  return s >= 2592000 ? new Date(iso).toISOString().slice(0, 10) : label
}

export function printJson(out: Out, data: unknown) {
  out.print(JSON.stringify(data, null, 2))
}
