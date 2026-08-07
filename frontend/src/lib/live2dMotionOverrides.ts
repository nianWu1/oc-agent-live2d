import { load } from '@tauri-apps/plugin-store'
import type { Live2DMotionMap } from './codexPet'

const STORE_KEY = 'live2d_motion_map_overrides'

let cache: Record<string, Live2DMotionMap> = {}
let ready: Promise<void> | null = null

async function getStore() {
  return load('settings.json', { defaults: {}, autoSave: true })
}

export function ensureLive2DMotionOverridesLoaded(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
        const store = await getStore()
        const raw = (await store.get(STORE_KEY)) as Record<string, Live2DMotionMap> | null
        cache = raw && typeof raw === 'object' ? { ...raw } : {}
      } catch (e) {
        console.warn('[live2dMotionOverrides] load failed:', e)
        cache = {}
      }
    })()
  }
  return ready
}

export function getLive2DMotionOverride(petId: string): Live2DMotionMap | undefined {
  const hit = cache[petId]
  return hit && Object.keys(hit).length > 0 ? hit : undefined
}

export function getAllLive2DMotionOverrides(): Record<string, Live2DMotionMap> {
  return { ...cache }
}

export async function saveLive2DMotionOverride(
  petId: string,
  map: Live2DMotionMap,
): Promise<void> {
  await ensureLive2DMotionOverridesLoaded()
  const cleaned: Live2DMotionMap = {}
  for (const [k, v] of Object.entries(map)) {
    if (v && typeof v.group === 'string') {
      cleaned[k as keyof Live2DMotionMap] = {
        group: v.group,
        index: v.index ?? null,
        loop: !!v.loop,
        expression: v.expression || null,
      }
    }
  }
  if (Object.keys(cleaned).length === 0) {
    delete cache[petId]
  } else {
    cache[petId] = cleaned
  }
  const store = await getStore()
  await store.set(STORE_KEY, cache)
  await store.save()
}

export async function clearLive2DMotionOverride(petId: string): Promise<void> {
  await ensureLive2DMotionOverridesLoaded()
  delete cache[petId]
  const store = await getStore()
  await store.set(STORE_KEY, cache)
  await store.save()
}
