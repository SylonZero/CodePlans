/** Callers pass the authenticated actor, never a client-supplied user ID. */
export type ArtifactActor = { id: string; kind?: 'user' | 'agent' }
export function editedBy(actor?: ArtifactActor) {
  return {
    updatedById: actor?.id ?? null,
    updatedByKind: actor ? (actor.kind ?? 'user') : null,
  }
}
export function createdBy(actor?: ArtifactActor) {
  return {
    createdById: actor?.id ?? null,
    createdByKind: actor ? (actor.kind ?? 'user') : null,
    ...editedBy(actor),
  }
}
