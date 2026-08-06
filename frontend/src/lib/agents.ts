import { getStore } from './store'

export async function loadAgentCharMap(): Promise<Record<string, string>> {
  const store = await getStore()
  return ((await store.get('agent_char_map')) as Record<string, string>) || {}
}

export async function saveAgentCharMap(map: Record<string, string>) {
  const store = await getStore()
  await store.set('agent_char_map', map)
  await store.save()
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch { return iso }
}

export function formatDuration(startIso: string): string {
  try {
    const ms = Date.now() - new Date(startIso).getTime()
    if (ms < 0) return '0分钟'
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}分钟`
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    if (hours < 24) return remMins > 0 ? `${hours}小时${remMins}分钟` : `${hours}小时`
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return remHours > 0 ? `${days}天${remHours}小时` : `${days}天`
  } catch { return '' }
}
