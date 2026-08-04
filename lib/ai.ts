import Anthropic from '@anthropic-ai/sdk'
import { config } from './config'
import type { ReleaseDetail } from './db/queries'

// AI drafting (releases-and-asset-history-spec.md, Phase D). Feature-flagged:
// off unless ANTHROPIC_API_KEY is configured. Drafts are returned to the UI as
// editable content — never auto-published.

export function aiEnabled(): boolean {
  return config.ai.enabled
}

/** Prompt builders are pure and exported for tests. */
export function buildReleaseNotesPrompt(release: ReleaseDetail): string {
  const assets = release.assets
    .map((a) => `- ${a.assetName} (${a.assetType})${a.version ? ` → ${a.version}` : ''}${a.notes ? ` — ${a.notes}` : ''}`)
    .join('\n')
  const plans = release.plans
    .map((p) => `- [${p.status}] ${p.title} (${p.completedTaskCount}/${p.taskCount} tasks)`)
    .join('\n')
  const items = release.workItems
    .map((i) => `- [${i.type}/${i.severity}] ${i.title} (${i.status})`)
    .join('\n')

  return [
    `Draft release notes for the release "${release.name}" of product "${release.productName}".`,
    release.description ? `Release description:\n${release.description}` : '',
    assets ? `Assets and versions delivered:\n${assets}` : 'No asset version stamps recorded.',
    plans ? `Code plans in this release:\n${plans}` : 'No plans attached.',
    items ? `Work items resolved or addressed (derived through the plans):\n${items}` : 'No linked work items.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildDesignNotePrompt(input: {
  assetName: string
  assetDescription?: string
  planTitle: string
  planDescription?: string
  taskTitles: string[]
}): string {
  return [
    `Draft a design note for the asset "${input.assetName}" describing what the completed code plan "${input.planTitle}" changed about the asset's design or structure.`,
    input.assetDescription ? `Asset description:\n${input.assetDescription}` : '',
    input.planDescription ? `Plan description:\n${input.planDescription}` : '',
    input.taskTitles.length > 0 ? `Tasks completed under the plan:\n${input.taskTitles.map((t) => `- ${t}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const RELEASE_NOTES_SYSTEM = `You draft release notes for an engineering team's internal release record.
Write markdown with three sections as applicable: a one-paragraph summary, "What's changed" grouped as Features / Fixes / Tech debt (bulleted, one line each, drawn only from the provided work items and plans), and "Assets" listing each asset with its new version.
Use only the facts provided — never invent features, fixes, or versions. Keep it under 300 words. Output only the markdown, no preamble.`

const DESIGN_NOTE_SYSTEM = `You draft a design-log note recording what a completed code plan changed about a software asset's design.
Respond with a short title on the first line (no heading marker, max 60 characters), then a blank line, then one or two markdown paragraphs on what changed structurally and why it matters for future work on this asset.
Use only the facts provided — do not speculate about implementation details you weren't given. Under 150 words total.`

function client(): Anthropic {
  return new Anthropic()
}

async function draft(system: string, prompt: string): Promise<string> {
  const response = await client().messages.create({
    model: config.ai.model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to draft this content.')
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
  if (!text) throw new Error('The model returned an empty draft.')
  return text
}

export async function draftReleaseNotes(release: ReleaseDetail): Promise<string> {
  return draft(RELEASE_NOTES_SYSTEM, buildReleaseNotesPrompt(release))
}

export async function draftDesignNote(
  input: Parameters<typeof buildDesignNotePrompt>[0],
): Promise<{ title: string; body: string }> {
  const text = await draft(DESIGN_NOTE_SYSTEM, buildDesignNotePrompt(input))
  const [firstLine, ...rest] = text.split('\n')
  const title = firstLine.replace(/^#+\s*/, '').trim().slice(0, 120) || `Design note: ${input.planTitle}`
  const body = rest.join('\n').trim()
  return { title, body: body || text }
}
