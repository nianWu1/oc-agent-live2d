// Codex-compatible pet asset model.
// Each pet is a single 8-column x 9-row atlas of 192x208 cells (1536x1872),
// matching the openai/skills hatch-pet output format. Row layout is by
// convention; pet.json itself does not declare it.

import {
  getLive2DMotionOverride,
  ensureLive2DMotionOverridesLoaded,
} from './live2dMotionOverrides'

// Kick off override load early so resolveLive2DMotion sees user edits.
void ensureLive2DMotionOverridesLoaded()

export type CodexPetState =
  | 'idle'
  | 'run-right'
  | 'run-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review'

export type PetKind = 'sprite' | 'live2d'

/** One oc-claw pet state → Live2D motion/expression binding. */
export interface Live2DMotionBinding {
  /** Cubism motion group name ("" is valid for some models like Mao). */
  group: string
  /** Optional index within the group; omit / null = random. */
  index?: number | null
  /** Keep replaying while the oc-claw state remains active. */
  loop?: boolean
  /** Optional expression name from model3.json Expressions. */
  expression?: string | null
}

/**
 * Map oc-claw animation states to a model's real Cubism motions.
 * Keys are CodexPetState names used by Mini/DemoMascot, plus the friendly
 * alias `working` (treated as `running`).
 */
export type Live2DMotionMap = Partial<
  Record<CodexPetState | 'working', Live2DMotionBinding>
>

/** @deprecated Prefer motionMap; kept for older pet.json files. */
export interface Live2DMotionGroups {
  idle?: string
  working?: string
  waiting?: string
  jumping?: string
}

export interface CodexPet {
  id: string
  displayName: string
  description: string
  // Resolved absolute URL ready to use as a CSS background-image source.
  // For Live2D pets this points at a preview texture instead of an atlas.
  spritesheetUrl: string
  kind?: PetKind
  // Absolute URL to `.model3.json` when kind === 'live2d'.
  modelUrl?: string
  /** Preferred: explicit oc-claw state → Cubism motion/expression map. */
  motionMap?: Live2DMotionMap
  /** Legacy group-name-only map. */
  motionGroups?: Live2DMotionGroups
  /** Declared for editors / docs; not required at runtime. */
  availableMotions?: Record<string, string[]>
  availableExpressions?: string[]
}

export function isLive2DPet(pet: CodexPet | null | undefined): boolean {
  return !!pet && pet.kind === 'live2d' && !!pet.modelUrl
}

/** Resolve the Live2D binding for a given oc-claw sprite state. */
export function resolveLive2DMotion(
  pet: CodexPet,
  state: CodexPetState,
): Live2DMotionBinding {
  const override = getLive2DMotionOverride(pet.id)
  const map: Live2DMotionMap | undefined = override
    ? { ...(pet.motionMap ?? {}), ...override }
    : pet.motionMap
  const direct = map?.[state]
  const aliased =
    direct ??
    (state === 'running' ? map?.working : undefined) ??
    ((state === 'run-left' || state === 'run-right')
      ? map?.[state] ?? map?.working
      : undefined) ??
    (state === 'review' || state === 'failed' ? map?.waiting ?? map?.idle : undefined)

  if (aliased && typeof aliased.group === 'string') {
    return {
      group: aliased.group,
      index: aliased.index,
      loop:
        aliased.loop ??
        (state === 'running' ||
          state === 'run-left' ||
          state === 'run-right' ||
          state === 'idle' ||
          state === 'waiting'),
      expression: aliased.expression,
    }
  }

  // Legacy motionGroups → synthetic binding.
  const g = pet.motionGroups
  const legacyGroup = (() => {
    switch (state) {
      case 'waiting':
        return g?.waiting ?? 'Idle'
      case 'running':
      case 'run-left':
      case 'run-right':
        return g?.working ?? 'Tap'
      case 'jumping':
      case 'waving':
        return g?.jumping ?? g?.working ?? 'Tap'
      default:
        return g?.idle ?? 'Idle'
    }
  })()
  const loop =
    state === 'running' ||
    state === 'run-left' ||
    state === 'run-right' ||
    state === 'waiting'
  return { group: legacyGroup, loop }
}

/** Effective motion map (builtin pet.json + user overrides). */
export function effectiveLive2DMotionMap(pet: CodexPet): Live2DMotionMap {
  const override = getLive2DMotionOverride(pet.id)
  return { ...(pet.motionMap ?? {}), ...(override ?? {}) }
}

export const ATLAS = {
  cellW: 192,
  cellH: 208,
  cols: 8,
  rows: 9,
} as const

export interface AnimationRow {
  row: number
  frames: number
}

// Standard hatch-pet row layout. Frame counts come from the canonical
// references/animation-rows.md contract used by the curated skill.
export const ANIMATION_ROWS: Record<CodexPetState, AnimationRow> = {
  'idle':      { row: 0, frames: 6 },
  'run-right': { row: 1, frames: 8 },
  'run-left':  { row: 2, frames: 8 },
  'waving':    { row: 3, frames: 4 },
  'jumping':   { row: 4, frames: 5 },
  'failed':    { row: 5, frames: 8 },
  'waiting':   { row: 6, frames: 6 },
  'running':   { row: 7, frames: 6 },
  'review':    { row: 8, frames: 6 },
}

export const SPRITE_FPS = 12

// Per-state fps overrides. States not listed fall back to SPRITE_FPS.
// Idle is intentionally slow (subtle breathing-style loop). Jumping plays
// slower than the default 12fps so the 5-frame animation reads clearly
// during the brief one-shot. Run/walk-style states are also softened so
// the dragging mascot doesn't feel jittery.
export const STATE_FPS: Partial<Record<CodexPetState, number>> = {
  idle: 2,
  jumping: 6,
  running: 6,
  waiting: 6,
  'run-left': 8,
  'run-right': 8,
}

export function fpsFor(state: CodexPetState): number {
  return STATE_FPS[state] ?? SPRITE_FPS
}

// Inter-cycle rest (ms) for looping sprite states. After completing a
// cycle, SpritePet holds the last frame for this duration before
// restarting from frame 0. Lets passive states like `waiting` read as
// repeated bursts with stillness in between (matching the jump cadence)
// instead of a continuous animation that feels too busy.
export const STATE_LOOP_REST_MS: Partial<Record<CodexPetState, number>> = {
  waiting: 600,
}

export function loopRestMsFor(state: CodexPetState): number {
  return STATE_LOOP_REST_MS[state] ?? 0
}

export const DEFAULT_PET_ID = 'phoebe'

// Default agent rotation queue used when the user hasn't customised one.
// Phoebe leads (matches the onboarding hero) and the rest follow the
// manifest order, capped at 10 entries.
export const DEFAULT_PET_QUEUE_IDS: string[] = [
  'phoebe',
  'doro',
  'elaina',
  'homie',
  'linnea',
  'mambo',
  'naruto',
  'nezuko',
  'skirk',
  'taffy',
]

// Maps Mini.tsx's `PetState` (idle/working/compacting/waiting) to a codex
// sprite state. Walking direction and hover are layered on top of this by
// the wrapper component, not by this function.
export type MiniPetSourceState = 'idle' | 'working' | 'compacting' | 'waiting'

export function petStateToCodexState(state: MiniPetSourceState): CodexPetState {
  switch (state) {
    case 'idle':
      return 'idle'
    case 'working':
    case 'compacting':
      return 'running'
    case 'waiting':
      return 'waiting'
    default:
      return 'idle'
  }
}

const BUILTIN_BASE = '/assets/builtin'
const MANIFEST_URL = `${BUILTIN_BASE}/pets-manifest.json`
const LIVE2D_BASE = '/assets/live2d'
const LIVE2D_MANIFEST_URL = `${LIVE2D_BASE}/manifest.json`

interface RawPetMeta {
  id: string
  displayName: string
  description: string
  spritesheetPath: string
}

interface RawLive2DPetMeta {
  id: string
  displayName: string
  description?: string
  kind?: PetKind
  modelPath: string
  previewPath?: string
  motionGroups?: Live2DMotionGroups
  motionMap?: Live2DMotionMap
  availableMotions?: Record<string, string[]>
  availableExpressions?: string[]
}

interface PetsManifest {
  pets: string[]
}

let cachedPets: Promise<CodexPet[]> | null = null

async function loadBuiltinSpritePets(): Promise<CodexPet[]> {
  const manifestRes = await fetch(MANIFEST_URL)
  if (!manifestRes.ok) {
    throw new Error(`pets-manifest.json fetch failed: ${manifestRes.status}`)
  }
  const manifest = (await manifestRes.json()) as PetsManifest
  const ids = Array.isArray(manifest.pets) ? manifest.pets : []

  const results = await Promise.all(
    ids.map(async (id): Promise<CodexPet | null> => {
      try {
        const res = await fetch(`${BUILTIN_BASE}/${id}/pet.json`)
        if (!res.ok) return null
        const meta = (await res.json()) as RawPetMeta
        return {
          id: meta.id || id,
          displayName: meta.displayName || id,
          description: meta.description || '',
          spritesheetUrl: `${BUILTIN_BASE}/${id}/${meta.spritesheetPath}`,
          kind: 'sprite',
        }
      } catch {
        return null
      }
    }),
  )
  return results.filter((p): p is CodexPet => p !== null)
}

async function loadBuiltinLive2DPets(): Promise<CodexPet[]> {
  try {
    const manifestRes = await fetch(LIVE2D_MANIFEST_URL)
    if (!manifestRes.ok) return []
    const manifest = (await manifestRes.json()) as PetsManifest
    const ids = Array.isArray(manifest.pets) ? manifest.pets : []
    const results = await Promise.all(
      ids.map(async (folder): Promise<CodexPet | null> => {
        try {
          const res = await fetch(`${LIVE2D_BASE}/${folder}/pet.json`)
          if (!res.ok) return null
          const meta = (await res.json()) as RawLive2DPetMeta
          const preview =
            meta.previewPath ||
            meta.modelPath.replace(/\.model3\.json$/i, '.png')
          return {
            id: meta.id || `live2d-${folder}`,
            displayName: meta.displayName || folder,
            description: meta.description || '',
            spritesheetUrl: `${LIVE2D_BASE}/${folder}/${preview}`,
            kind: 'live2d',
            modelUrl: `${LIVE2D_BASE}/${folder}/${meta.modelPath}`,
            motionGroups: meta.motionGroups,
            motionMap: meta.motionMap,
            availableMotions: meta.availableMotions,
            availableExpressions: meta.availableExpressions,
          }
        } catch {
          return null
        }
      }),
    )
    return results.filter((p): p is CodexPet => p !== null)
  } catch (e) {
    console.warn('[codexPet] loadBuiltinLive2DPets failed:', e)
    return []
  }
}

export function loadCodexPets(): Promise<CodexPet[]> {
  if (!cachedPets) {
    cachedPets = (async () => {
      const [sprites, live2d] = await Promise.all([
        loadBuiltinSpritePets(),
        loadBuiltinLive2DPets(),
      ])
      return [...sprites, ...live2d]
    })()
  }
  return cachedPets
}

export async function loadCodexPetById(id: string): Promise<CodexPet | null> {
  const builtins = await loadCodexPets()
  const hit = builtins.find((p) => p.id === id)
  if (hit) return hit
  const customs = await loadCustomCodexPets()
  const customHit = customs.find((p) => p.id === id)
  if (customHit) return customHit
  const live2dCustoms = await loadCustomLive2DPets()
  return live2dCustoms.find((p) => p.id === id) ?? null
}

export async function loadDefaultCodexPet(): Promise<CodexPet | null> {
  const pets = await loadCodexPets()
  if (pets.length === 0) return null
  return pets.find((p) => p.id === DEFAULT_PET_ID) ?? pets[0]
}

// Reset the manifest cache so the next call rescans `pets-manifest.json`.
// Used by the picker's refresh button after the user drops in new assets.
export function clearCodexPetCache(): void {
  cachedPets = null
}

// Pets dropped into `~/.codex/pets/` by the user. Loaded via the Rust
// `list_custom_codex_pets` command which serves them through the asset
// protocol so they render outside the bundled `public/` tree.
export async function loadCustomCodexPets(): Promise<CodexPet[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = (await invoke('list_custom_codex_pets')) as Array<{
      id: string
      displayName: string
      description: string
      spritesheetUrl: string
    }>
    return raw.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      description: m.description,
      spritesheetUrl: m.spritesheetUrl,
      kind: 'sprite' as const,
    }))
  } catch (e) {
    console.warn('[codexPet] loadCustomCodexPets failed:', e)
    return []
  }
}

/** User-imported Live2D models under app data `live2d/`. */
export async function loadCustomLive2DPets(): Promise<CodexPet[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = (await invoke('list_custom_live2d_pets')) as Array<{
      id: string
      displayName: string
      description: string
      modelUrl: string
      previewUrl: string
      motionMap?: Live2DMotionMap
      availableMotions?: Record<string, string[]>
      availableExpressions?: string[]
    }>
    return raw.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      description: m.description,
      spritesheetUrl: m.previewUrl || m.modelUrl,
      kind: 'live2d' as const,
      modelUrl: m.modelUrl,
      motionMap: m.motionMap,
      availableMotions: m.availableMotions,
      availableExpressions: m.availableExpressions,
    }))
  } catch (e) {
    console.warn('[codexPet] loadCustomLive2DPets failed:', e)
    return []
  }
}
