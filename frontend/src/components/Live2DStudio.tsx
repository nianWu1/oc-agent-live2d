import { useCallback, useEffect, useMemo, useState } from 'react'
import { emit } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Check, RotateCcw } from 'lucide-react'
import { Live2DPet } from './Live2DPet'
import {
  clearCodexPetCache,
  effectiveLive2DMotionMap,
  isLive2DPet,
  loadCodexPets,
  loadCustomLive2DPets,
  type CodexPet,
  type Live2DMotionBinding,
  type Live2DMotionMap,
} from '../lib/codexPet'
import {
  clearLive2DMotionOverride,
  ensureLive2DMotionOverridesLoaded,
  saveLive2DMotionOverride,
} from '../lib/live2dMotionOverrides'

const OC_STATES: { key: keyof Live2DMotionMap; label: string; hint: string }[] = [
  { key: 'idle', label: 'idle', hint: '空闲' },
  { key: 'working', label: 'working', hint: '任务进行中' },
  { key: 'waiting', label: 'waiting', hint: '等待确认 Shell/MCP' },
  { key: 'jumping', label: 'jumping', hint: '悬停跳一下' },
  { key: 'run-left', label: 'run-left', hint: '向左拖动' },
  { key: 'run-right', label: 'run-right', hint: '向右拖动' },
]

type Discovered = {
  motions: Record<string, number>
  expressions: string[]
}

async function discoverFromModel(modelUrl: string): Promise<Discovered> {
  try {
    const res = await fetch(modelUrl)
    if (!res.ok) return { motions: {}, expressions: [] }
    const json = (await res.json()) as {
      FileReferences?: {
        Motions?: Record<string, unknown[]>
        Expressions?: Array<{ Name?: string }>
      }
    }
    const motions: Record<string, number> = {}
    for (const [group, list] of Object.entries(json.FileReferences?.Motions ?? {})) {
      motions[group] = Array.isArray(list) ? list.length : 0
    }
    const expressions = (json.FileReferences?.Expressions ?? [])
      .map((e) => e.Name)
      .filter((n): n is string => !!n)
    return { motions, expressions }
  } catch {
    return { motions: {}, expressions: [] }
  }
}

function groupLabel(group: string): string {
  return group === '' ? '(空组 "")' : group
}

/**
 * Settings panel: preview Live2D motions and edit oc-claw → Cubism mappings.
 * Overrides persist in settings.json and merge on top of each pet's pet.json.
 */
export function Live2DStudio() {
  const [pets, setPets] = useState<CodexPet[]>([])
  const [customIds, setCustomIds] = useState<Set<string>>(new Set())
  const [petId, setPetId] = useState('')
  const [discovered, setDiscovered] = useState<Discovered>({ motions: {}, expressions: [] })
  const [forceBinding, setForceBinding] = useState<Live2DMotionBinding | null>(null)
  const [draftMap, setDraftMap] = useState<Live2DMotionMap>({})
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [tab, setTab] = useState<'preview' | 'map'>('preview')
  // Opt-in: mounting Pixi in the shared mini webview is expensive and used
  // to freeze the whole UI on unmount. Keep canvas off until the user asks.
  const [previewOn, setPreviewOn] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const reloadPets = useCallback(async () => {
    await ensureLive2DMotionOverridesLoaded()
    clearCodexPetCache()
    const [builtins, customs] = await Promise.all([
      loadCodexPets(),
      loadCustomLive2DPets(),
    ])
    const builtinIds = new Set(builtins.map((p) => p.id))
    const customLive = customs.filter((p) => isLive2DPet(p) && !builtinIds.has(p.id))
    const live = [...builtins.filter(isLive2DPet), ...customLive]
    setCustomIds(new Set(customLive.map((p) => p.id)))
    setPets(live)
    setPetId((prev) => {
      if (prev && live.some((p) => p.id === prev)) return prev
      return live[0]?.id ?? ''
    })
  }, [])

  useEffect(() => {
    void reloadPets()
  }, [reloadPets])

  const pet = useMemo(() => pets.find((p) => p.id === petId) ?? null, [pets, petId])
  const isCustomPet = !!pet && customIds.has(pet.id)
  const motionCount = useMemo(() => {
    if (!pet?.availableMotions) return 0
    return Object.values(pet.availableMotions).reduce((n, files) => n + (files?.length ?? 0), 0)
  }, [pet])

  useEffect(() => {
    setLoadError(null)
    setPreviewOn(false)
    setForceBinding(null)
  }, [petId])

  const handleDelete = useCallback(async () => {
    if (!pet || !isCustomPet || deleting) return
    if (!window.confirm(`删除导入的 Live2D 模型「${pet.displayName}」？删除后可重新导入。`)) {
      return
    }
    setDeleting(true)
    try {
      setPreviewOn(false)
      await invoke('delete_live2d_pet', { id: pet.id })
      await clearLive2DMotionOverride(pet.id).catch(() => {})
      emit('live2d-motion-map-changed', { petId: pet.id }).catch(() => {})
      await reloadPets()
    } catch (e: unknown) {
      const msg =
        typeof e === 'string' ? e : e instanceof Error ? e.message : 'delete failed'
      setLoadError(msg)
    } finally {
      setDeleting(false)
    }
  }, [pet, isCustomPet, deleting, reloadPets])

  useEffect(() => {
    if (!pet?.modelUrl) return
    setForceBinding(null)
    setDraftMap(effectiveLive2DMotionMap(pet))
    void discoverFromModel(pet.modelUrl).then((d) => {
      const fromPet: Record<string, number> = {}
      for (const [g, files] of Object.entries(pet.availableMotions ?? {})) {
        fromPet[g] = files.length
      }
      setDiscovered({
        motions: Object.keys(fromPet).length > 0 ? fromPet : d.motions,
        expressions:
          (pet.availableExpressions?.length ?? 0) > 0
            ? pet.availableExpressions!
            : d.expressions,
      })
    })
  }, [pet])

  // Tear down WebGL when leaving the studio host (settings tab switch / close).
  useEffect(() => {
    return () => {
      setPreviewOn(false)
      setForceBinding(null)
    }
  }, [])

  const motionGroups = useMemo(() => Object.keys(discovered.motions), [discovered.motions])

  const play = useCallback((binding: Live2DMotionBinding) => {
    setPreviewOn(true)
    setForceBinding({ ...binding, loop: binding.loop ?? false })
  }, [])

  const updateDraft = (key: keyof Live2DMotionMap, patch: Partial<Live2DMotionBinding>) => {
    setDraftMap((prev) => {
      const cur = prev[key] ?? { group: motionGroups[0] ?? 'Idle', index: 0, loop: false }
      return { ...prev, [key]: { ...cur, ...patch } }
    })
  }

  const handleSave = async () => {
    if (!pet) return
    setSaving(true)
    try {
      await saveLive2DMotionOverride(pet.id, draftMap)
      clearCodexPetCache()
      emit('live2d-motion-map-changed', { petId: pet.id }).catch(() => {})
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!pet) return
    await clearLive2DMotionOverride(pet.id)
    clearCodexPetCache()
    setDraftMap({ ...(pet.motionMap ?? {}) })
    emit('live2d-motion-map-changed', { petId: pet.id }).catch(() => {})
  }

  if (pets.length === 0) {
    return (
      <div className="text-xs text-white/40 px-1">
        未找到 Live2D 模型。请确认 `frontend/public/assets/live2d/` 已同步。
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={petId}
          onChange={(e) => setPetId(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white/85"
        >
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (previewOn) {
              setPreviewOn(false)
              setForceBinding(null)
            } else {
              setPreviewOn(true)
            }
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
            previewOn
              ? 'bg-rose-500/20 border-rose-400/40 text-rose-100'
              : 'bg-sky-500/80 border-sky-400/50 text-white'
          }`}
        >
          {previewOn ? '关闭预览' : '启动预览'}
        </button>
        {isCustomPet && (
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleDelete()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-rose-500/15 border-rose-400/30 text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
            title="删除后可重新导入同名文件夹"
          >
            {deleting ? '删除中…' : '删除导入'}
          </button>
        )}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-3 py-1.5 text-xs ${tab === 'preview' ? 'bg-white/15 text-white' : 'bg-black/30 text-white/50'}`}
          >
            试播动作
          </button>
          <button
            type="button"
            onClick={() => setTab('map')}
            className={`px-3 py-1.5 text-xs ${tab === 'map' ? 'bg-white/15 text-white' : 'bg-black/30 text-white/50'}`}
          >
            映射配置
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div
          className="shrink-0 rounded-xl bg-gradient-to-b from-sky-950/40 to-black/60 border border-white/10 flex items-end justify-center overflow-hidden"
          style={{ width: 220, height: 260 }}
        >
          {pet && previewOn ? (
            <Live2DPet
              pet={pet}
              state="idle"
              size={200}
              forceBinding={forceBinding}
              onLoadError={(msg) => setLoadError(msg)}
              onLoadOk={() => setLoadError(null)}
            />
          ) : (
            <div className="text-[11px] text-white/35 px-4 text-center self-center">
              点击「启动预览」后加载模型
              <br />
              （避免占用桌宠同一窗口的 GPU）
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {loadError && (
            <div className="text-[11px] text-rose-300/90 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-all">
              加载失败：{loadError}
              <div className="text-white/40 mt-1">
                可尝试重新导入该文件夹（会自动去掉文件名空格并修补 Motions）。
              </div>
            </div>
          )}
          {pet && motionCount === 0 && (
            <div className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              此模型没有 <code className="text-white/70">*.motion3.json</code>
              （如 maho / MAY）。可以静态显示，但无法播放 idle/working 动作。
            </div>
          )}
          {tab === 'preview' && (
            <>
              <div className="text-[11px] text-white/40">
                点下面按钮试播模型自带动作。看好哪个再去「映射配置」绑到 oc-claw 状态。
              </div>
              {forceBinding && (
                <div className="text-[11px] text-sky-300/80 font-mono truncate">
                  正在播: group={JSON.stringify(forceBinding.group)}
                  {typeof forceBinding.index === 'number' ? ` index=${forceBinding.index}` : ''}
                  {forceBinding.expression ? ` expr=${forceBinding.expression}` : ''}
                </div>
              )}
              <div className="flex flex-col gap-3 max-h-[320px] overflow-y-auto pr-1">
                {motionGroups.map((group) => {
                  const count = discovered.motions[group] ?? 0
                  return (
                    <div key={group || '__empty'} className="flex flex-col gap-1.5">
                      <div className="text-xs text-white/60 font-medium">{groupLabel(group)}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: count }, (_, index) => (
                          <button
                            key={`${group}-${index}`}
                            type="button"
                            onClick={() => play({ group, index, loop: false })}
                            className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                              forceBinding?.group === group && forceBinding?.index === index
                                ? 'bg-sky-500/30 border-sky-400/50 text-white'
                                : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                            }`}
                          >
                            #{index}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => play({ group, index: null, loop: true })}
                          className="px-2 py-1 rounded-md text-[11px] border border-dashed border-white/15 text-white/40 hover:text-white/70"
                        >
                          随机循环
                        </button>
                      </div>
                    </div>
                  )
                })}
                {discovered.expressions.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-white/5">
                    <div className="text-xs text-white/60 font-medium">表情 Expressions</div>
                    <div className="flex flex-wrap gap-1.5">
                      {discovered.expressions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            play({
                              group: forceBinding?.group ?? motionGroups[0] ?? 'Idle',
                              index: forceBinding?.index ?? 0,
                              expression: name,
                              loop: false,
                            })
                          }
                          className={`px-2 py-1 rounded-md text-[11px] border ${
                            forceBinding?.expression === name
                              ? 'bg-violet-500/30 border-violet-400/50 text-white'
                              : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'map' && (
            <>
              <div className="text-[11px] text-white/40">
                为每个 oc-claw 状态选择模型动作。保存后桌宠立即按新映射播放（写入本地 settings，不改仓库里的 pet.json）。
              </div>
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {OC_STATES.map(({ key, label, hint }) => {
                  const row = draftMap[key] ?? {
                    group: motionGroups[0] ?? 'Idle',
                    index: 0,
                    loop:
                      key === 'working' ||
                      key === 'run-left' ||
                      key === 'run-right' ||
                      key === 'idle' ||
                      key === 'waiting',
                  }
                  const count = discovered.motions[row.group ?? ''] ?? 0
                  return (
                    <div
                      key={label}
                      className="rounded-lg border border-white/8 bg-black/30 p-2.5 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs text-white/85 font-medium">{label}</div>
                          <div className="text-[10px] text-white/35">{hint}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => play({ ...row, loop: !!row.loop })}
                          className="shrink-0 px-2 py-1 rounded-md text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-white/70"
                        >
                          试播
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-0.5 text-[10px] text-white/40">
                          group
                          <select
                            value={row.group ?? ''}
                            onChange={(e) => updateDraft(key, { group: e.target.value, index: 0 })}
                            className="bg-black/50 border border-white/10 rounded px-1.5 py-1 text-xs text-white/80"
                          >
                            {motionGroups.map((g) => (
                              <option key={g || '__empty'} value={g}>
                                {groupLabel(g)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[10px] text-white/40">
                          index
                          <select
                            value={row.index ?? 0}
                            onChange={(e) => updateDraft(key, { index: Number(e.target.value) })}
                            className="bg-black/50 border border-white/10 rounded px-1.5 py-1 text-xs text-white/80"
                          >
                            {Array.from({ length: Math.max(count, 1) }, (_, i) => (
                              <option key={i} value={i}>
                                #{i}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[10px] text-white/40 col-span-2">
                          expression（可选）
                          <select
                            value={row.expression ?? ''}
                            onChange={(e) =>
                              updateDraft(key, { expression: e.target.value || null })
                            }
                            className="bg-black/50 border border-white/10 rounded px-1.5 py-1 text-xs text-white/80"
                          >
                            <option value="">（无）</option>
                            {discovered.expressions.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-white/55">
                        <input
                          type="checkbox"
                          checked={!!row.loop}
                          onChange={(e) => updateDraft(key, { loop: e.target.checked })}
                        />
                        循环播放（working / 拖动建议勾选）
                      </label>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving || !pet}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/80 hover:bg-sky-500 text-white disabled:opacity-50"
                >
                  {savedFlash ? <Check className="w-3.5 h-3.5" /> : null}
                  {savedFlash ? '已保存' : saving ? '保存中…' : '保存映射'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 border border-white/10"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  恢复默认
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
