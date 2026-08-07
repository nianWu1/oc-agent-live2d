import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { load } from '@tauri-apps/plugin-store'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { Maximize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MiniPetMascot } from './components/MiniPetMascot'
import type { PetStatusTone } from './components/PetStatusBubble'
import { loadCodexPetById, loadDefaultCodexPet, type CodexPet, type CodexPetState } from './lib/codexPet'

const isWindowsPlatform =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')

// Matches Mini.tsx: the collapsed small mascot's visual size is
// round(MASCOT_BASE_SIZE * mascotScale) * largeMascotScale, driven by the
// "Mascot Size" slider (large_mascot_scale). Mirror that here so extra mascots
// scale together with the primary one.
function computeMascotSize(mascotScale: number, largeMascotScale: number): number {
  return Math.round(MASCOT_BASE_SIZE * mascotScale) * largeMascotScale
}

// Lightweight mascot-only window used by the dev "演示模式" toggle.
// Spawned by the `spawn_demo_mascot` Tauri command with `?demo=1&pet=<id>`
// in the URL. Each window picks up a single codex pet, listens to the
// same Claude/Codex/Cursor task events the main mini window does, and
// shows the corresponding running/idle/jumping animation. State naturally
// stays in sync because every demo window subscribes to the same events.
const MASCOT_BASE_SIZE = 43
const LARGE_MASCOT_SCALE_MIN = 1
const LARGE_MASCOT_SCALE_MAX = 6
const MASCOT_RESIZE_HANDLE_SIZE = 34
const MASCOT_RESIZE_ICON_SIZE = 26
const MASCOT_RESIZE_CURSOR = 'nwse-resize'
// Default before the real scale is loaded from settings, matching Mini's
// defaults (mascot_scale 1 × large_mascot_scale 5).
const DEFAULT_MASCOT_SIZE = computeMascotSize(1, 5)

function clampLargeMascotScale(value: number): number {
  if (!Number.isFinite(value)) return 5
  return Math.min(LARGE_MASCOT_SCALE_MAX, Math.max(LARGE_MASCOT_SCALE_MIN, value))
}

function isPetStatusTone(v: unknown): v is PetStatusTone {
  return (
    v === 'idle' ||
    v === 'working' ||
    v === 'waiting' ||
    v === 'thinking' ||
    v === 'tool' ||
    v === 'compacting'
  )
}

// `functional` mascots (coding-mode multi-mascot feature) emit
// `extra-mascot-activate` to the main mini window on a click (no drag) so the
// main panel expands — making each extra mascot equivalent to the primary one.
// Demo mascots leave `functional` false and stay decorative.
export function DemoMascot({ functional = false }: { functional?: boolean }) {
  const { t } = useTranslation()
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const petIdFromUrl = params.get('pet') ?? ''
  const statusUrlFromUrl = params.get('statusUrl') ?? ''
  const [pet, setPet] = useState<CodexPet | null>(null)
  const [working, setWorking] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [statusDetail, setStatusDetail] = useState('')
  const [statusKind, setStatusKind] = useState('')
  const [walkDir, setWalkDir] = useState<-1 | 0 | 1>(0)
  const [dragging, setDragging] = useState(false)
  const [resizeHandleHovered, setResizeHandleHovered] = useState(false)
  const [size, setSize] = useState(DEFAULT_MASCOT_SIZE)
  const [mascotMode, setMascotMode] = useState<'lock' | 'drag'>('drag')
  const [remoteBubble, setRemoteBubble] = useState<{
    label: string
    tone: PetStatusTone
    title?: string
  } | null>(null)
  const dragActiveRef = useRef(false)
  const baseSizeRef = useRef(MASCOT_BASE_SIZE)
  const largeScaleRef = useRef(5)
  const mascotModeRef = useRef<'lock' | 'drag'>('drag')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const found = (petIdFromUrl ? await loadCodexPetById(petIdFromUrl) : null) ?? (await loadDefaultCodexPet())
      if (!cancelled) setPet(found)
    })()
    return () => {
      cancelled = true
    }
  }, [petIdFromUrl])

  // Global lock/drag mode (same setting as primary mini).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const store = await load('settings.json', { defaults: {}, autoSave: false })
        const mim = await store.get('mascot_interaction_mode')
        if (!cancelled && (mim === 'lock' || mim === 'drag')) {
          mascotModeRef.current = mim
          setMascotMode(mim)
        }
      } catch {
        /* default drag */
      }
    })()
    const unlisten = listen<{ mode?: string }>('mascot-interaction-mode', (ev) => {
      const mode = ev.payload?.mode
      if (mode === 'lock' || mode === 'drag') {
        mascotModeRef.current = mode
        setMascotMode(mode)
      }
    })
    return () => {
      cancelled = true
      unlisten.then((fn) => fn())
    }
  }, [])

  // Match the primary mascot's size. Read the persisted scale on mount and keep
  // in sync with live slider changes broadcast by the main window. The owning
  // webview window is resized to fit so the mascot never clips and the
  // transparent drag area stays tight to the sprite.
  useEffect(() => {
    let cancelled = false
    const applySize = (next: number) => {
      if (cancelled || !Number.isFinite(next) || next <= 0) return
      setSize(next)
      largeScaleRef.current = clampLargeMascotScale(next / Math.max(1, baseSizeRef.current))
      const win = getCurrentWebviewWindow()
      const boxW = Math.ceil(next)
      const boxH = Math.ceil(next * (208 / 192))
      win.setSize(new LogicalSize(boxW, boxH)).catch(() => {})
    }
    ;(async () => {
      try {
        const store = await load('settings.json', { defaults: {}, autoSave: false })
        const ms = (await store.get('mascot_scale')) as number | null
        const lms = (await store.get('large_mascot_scale')) as number | null
        const mascotScale = typeof ms === 'number' && ms > 0 ? ms : 1
        const largeScale = clampLargeMascotScale(typeof lms === 'number' && lms > 0 ? lms : 5)
        baseSizeRef.current = Math.round(MASCOT_BASE_SIZE * mascotScale)
        largeScaleRef.current = largeScale
        applySize(computeMascotSize(
          mascotScale,
          largeScale,
        ))
      } catch {
        /* fall back to default size */
      }
    })()
    const unlisten = listen<{ size?: number }>('mascot-visual-size', (ev) => {
      const s = ev.payload?.size
      if (typeof s === 'number') applySize(s)
    })
    return () => {
      cancelled = true
      unlisten.then((fn) => fn())
    }
  }, [])

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    if (mascotModeRef.current === 'lock') return
    if (e.button !== 0 || e.ctrlKey) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.screenX
    const startY = e.screenY
    const startSize = size
    const baseSize = Math.max(1, baseSizeRef.current)
    const aspect = 208 / 192
    const pid = e.pointerId
    let latestScale = largeScaleRef.current
    let rafId: number | null = null

    const applyScale = (scale: number) => {
      const clamped = clampLargeMascotScale(scale)
      latestScale = clamped
      largeScaleRef.current = clamped
      const nextSize = baseSize * clamped
      setSize(nextSize)
      const win = getCurrentWebviewWindow()
      win.setSize(new LogicalSize(Math.ceil(nextSize), Math.ceil(nextSize * aspect))).catch(() => {})
      emit('mascot-scale-change', { scale: clamped }).catch(() => {})
      emit('mascot-visual-size', { size: nextSize }).catch(() => {})
    }

    const schedule = (scale: number) => {
      latestScale = scale
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        applyScale(latestScale)
      })
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      const dx = ev.screenX - startX
      const dy = ev.screenY - startY
      const targetSize = startSize + Math.max(dx, dy / aspect)
      schedule(targetSize / baseSize)
    }

    const cleanup = async () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      applyScale(latestScale)
      try {
        const store = await load('settings.json', { defaults: {}, autoSave: true })
        await store.set('large_mascot_scale', latestScale)
        await store.save()
      } catch {
        /* main mini window also persists via mascot-scale-change */
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setResizeHandleHovered(false)
    }

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      cleanup().catch(() => {})
    }

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      cleanup().catch(() => {})
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onCancel, { once: true })
  }, [size])

  // Independent Cursor status bridge (statusUrl query) OR mirror primary mini.
  useEffect(() => {
    if (statusUrlFromUrl) {
      let cancelled = false
      const applyState = (state: string, detail?: string, kind?: string) => {
        const s = (state || '').toLowerCase()
        const k = (kind || '').toLowerCase()
        if (s === 'waiting' || s === 'awaiting' || k.startsWith('confirm')) {
          setWaiting(true)
          setWorking(false)
        } else if (
          s === 'working' ||
          s === 'compacting' ||
          s === 'running' ||
          s === 'busy' ||
          s === 'active' ||
          k === 'working' ||
          k === 'tool' ||
          k === 'thinking'
        ) {
          setWaiting(false)
          setWorking(true)
        } else {
          // completed / idle / error / unknown → idle animation
          setWaiting(false)
          setWorking(false)
        }
        if (typeof detail === 'string') setStatusDetail(detail)
        if (typeof kind === 'string') setStatusKind(kind)
      }
      const poll = async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const text = (await invoke('proxy_get', { url: statusUrlFromUrl })) as string
          if (cancelled) return
          const data = JSON.parse(text) as {
            state?: string
            detail?: string
            status?: string
            kind?: string
          }
          applyState(data.state || data.status || 'idle', data.detail, data.kind)
        } catch (e) {
          if (!cancelled) console.warn('[extra-mascot] status poll failed:', e)
        }
      }
      void poll()
      const id = window.setInterval(poll, 2000)
      return () => {
        cancelled = true
        window.clearInterval(id)
      }
    }

    const unlisten = listen<{
      state?: string
      label?: string
      tone?: string
      title?: string | null
    }>('mini-pet-state', (ev) => {
      const s = (ev.payload?.state || '').toLowerCase()
      let nextWaiting = false
      let nextWorking = false
      if (s === 'waiting') {
        nextWaiting = true
      } else if (s === 'working' || s === 'compacting') {
        nextWorking = true
      }
      setWaiting(nextWaiting)
      setWorking(nextWorking)

      // Always refresh bubble from this event so a stale "空闲中" label cannot
      // stick after state flips to working (label may be briefly missing).
      const label = typeof ev.payload?.label === 'string' ? ev.payload.label.trim() : ''
      const toneFromPayload = isPetStatusTone(ev.payload?.tone) ? ev.payload.tone : null
      const tone: PetStatusTone = toneFromPayload
        ?? (nextWaiting ? 'waiting' : nextWorking ? 'working' : 'idle')
      setRemoteBubble({
        label: label || (nextWaiting ? 'waiting' : nextWorking ? 'working' : 'idle'),
        tone,
        title: typeof ev.payload?.title === 'string' ? ev.payload.title : undefined,
      })
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [statusUrlFromUrl])

  // Match primary Mini drag: absolute origin via native get/set_webview_origin
  // with confine=false so extra mascots can cross monitors / macOS Spaces.
  // macOS NSWindow Y grows upward while screenY grows downward — invert dy
  // there. (Primary mini avoids this by dragging in Rust translate_mini_frame.)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (mascotModeRef.current === 'lock') {
      // Locked: no drag. Functional extras can still activate the main panel
      // when click-through is off (e.g. while the primary panel is open).
      if (functional && isWindowsPlatform && e.button === 0 && !e.ctrlKey) {
        emit('extra-mascot-activate').catch(() => {})
      }
      return
    }
    if (e.button !== 0 || e.ctrlKey) return
    e.preventDefault()
    dragActiveRef.current = true
    const startX = e.screenX
    const startY = e.screenY
    let lastX = e.screenX
    let dragging = false
    const pid = e.pointerId
    let originX = 0
    let originY = 0
    let originReady = false
    let targetX = 0
    let targetY = 0
    let rafId: number | null = null
    let latestDxTotal = 0
    let latestDyTotal = 0
    let positionInFlight = false
    let positionDirty = false
    // Windows: top-left logical coords → add screen dy.
    // macOS: NSWindow bottom-left → subtract screen dy.
    const ySign = isWindowsPlatform ? 1 : -1

    const applyTargets = () => {
      targetX = originX + latestDxTotal
      targetY = originY + ySign * latestDyTotal
    }

    invoke<[number, number]>('get_webview_origin')
      .then(([x, y]) => {
        originX = x
        originY = y
        applyTargets()
        originReady = true
        if (dragging) schedulePosition()
      })
      .catch(() => {
        originReady = false
      })

    const flushPosition = () => {
      rafId = null
      if (!originReady || !dragActiveRef.current) return
      if (positionInFlight) {
        positionDirty = true
        return
      }
      positionInFlight = true
      const x = targetX
      const y = targetY
      invoke('set_webview_origin', { x, y, confine: false })
        .catch(() => {})
        .finally(() => {
          positionInFlight = false
          if (positionDirty && dragActiveRef.current) {
            positionDirty = false
            schedulePosition()
          }
        })
    }

    const schedulePosition = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(flushPosition)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      const dxTotal = ev.screenX - startX
      const dyTotal = ev.screenY - startY
      if (!dragging) {
        if (Math.abs(dxTotal) + Math.abs(dyTotal) >= 3) {
          dragging = true
          setDragging(true)
        } else {
          return
        }
      }
      latestDxTotal = dxTotal
      latestDyTotal = dyTotal
      if (originReady) {
        applyTargets()
        schedulePosition()
      }
      const dx = ev.screenX - lastX
      lastX = ev.screenX
      if (dx !== 0) setWalkDir(dx > 0 ? 1 : -1)
    }

    const cleanup = () => {
      dragActiveRef.current = false
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (originReady) {
        invoke('set_webview_origin', { x: targetX, y: targetY, confine: false })
          .then(() => invoke('reassert_floating'))
          .catch(() => {})
      } else {
        invoke('reassert_floating').catch(() => {})
      }
      setWalkDir(0)
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      cleanup()
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      const wasDragging = dragging
      cleanup()
      if (functional && !wasDragging && isWindowsPlatform) {
        emit('extra-mascot-activate').catch(() => {})
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onCancel, { once: true })
  }, [functional])

  const baseState: CodexPetState = walkDir === 1
    ? 'run-right'
    : walkDir === -1
      ? 'run-left'
      : waiting
        ? 'waiting'
        : working
          ? 'running'
          : 'idle'

  const confirmLabel = (() => {
    const k = statusKind.toLowerCase()
    if (k === 'confirm_shell') return '确认 Shell'
    if (k === 'confirm_mcp') return '确认 MCP'
    if (k === 'confirm_tool' || k === 'confirm') return '需要确认'
    if (waiting && statusUrlFromUrl) return '需要确认'
    return ''
  })()

  const statusBubble = useMemo(() => {
    // Local working/waiting flags are the source of truth for phase; remote
    // labels only enrich text when they match that phase (avoids sticky 空闲中).
    if (waiting) {
      if (confirmLabel) {
        return {
          label: confirmLabel,
          tone: 'waiting' as PetStatusTone,
          title: statusDetail || confirmLabel,
        }
      }
      if (remoteBubble?.tone === 'waiting' && remoteBubble.label && remoteBubble.label !== 'waiting') {
        return { ...remoteBubble, title: remoteBubble.title || statusDetail || undefined }
      }
      return {
        label: t('mini.statusWaitingTool'),
        tone: 'waiting' as PetStatusTone,
        title: statusDetail || undefined,
      }
    }
    if (working) {
      if (
        remoteBubble &&
        remoteBubble.tone !== 'idle' &&
        remoteBubble.tone !== 'waiting' &&
        remoteBubble.label &&
        remoteBubble.label !== 'working' &&
        remoteBubble.label !== 'idle'
      ) {
        return remoteBubble
      }
      return { label: t('mini.working'), tone: 'working' as PetStatusTone }
    }
    return { label: t('mini.idleBusy'), tone: 'idle' as PetStatusTone }
  }, [confirmLabel, waiting, working, statusDetail, remoteBubble, t])

  if (!pet) return null

  const locked = mascotMode === 'lock'

  return (
    <div
      onPointerDown={handlePointerDown}
      title={statusDetail || statusUrlFromUrl || undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        cursor: locked ? 'default' : 'grab',
      }}
    >
      <MiniPetMascot
        pet={pet}
        baseState={baseState}
        size={size}
        enableHoverJump
        suppressHover={dragging}
        statusLabel={statusBubble.label}
        statusTone={statusBubble.tone}
        statusTitle={statusBubble.title}
      />
      {!locked && (
        <div
          data-no-drag
          onPointerEnter={() => setResizeHandleHovered(true)}
          onPointerLeave={() => setResizeHandleHovered(false)}
          onPointerDown={handleResizePointerDown}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: MASCOT_RESIZE_HANDLE_SIZE,
            height: MASCOT_RESIZE_HANDLE_SIZE,
            cursor: MASCOT_RESIZE_CURSOR,
            pointerEvents: 'auto',
            zIndex: 12,
            touchAction: 'none',
            background: 'rgba(255,255,255,0.01)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 4,
          }}
        >
          <div
            style={{
              width: MASCOT_RESIZE_ICON_SIZE,
              height: MASCOT_RESIZE_ICON_SIZE,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.94)',
              boxShadow: '0 3px 10px rgba(0,0,0,0.22)',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: MASCOT_RESIZE_CURSOR,
              opacity: resizeHandleHovered ? 1 : 0,
              transform: resizeHandleHovered ? 'translateY(0) scale(1) rotate(90deg)' : 'translateY(3px) scale(0.92) rotate(90deg)',
              transition: 'opacity 120ms ease, transform 120ms ease',
              pointerEvents: 'none',
            }}
          >
            <Maximize2 size={15} strokeWidth={2.4} />
          </div>
        </div>
      )}
      {/* Status indicator dot, mirroring the primary mascot's bottom-right
          light so coding-mode extra mascots show the same working/waiting/idle
          status. Decorative demo mascots stay clean. */}
      {functional && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 10,
            width: waiting ? 8 : 5,
            height: waiting ? 8 : 5,
            borderRadius: '50%',
            background: waiting ? '#f59e0b' : working ? '#2ecc71' : '#777',
            boxShadow: waiting ? '0 0 0 3px rgba(245,158,11,0.45)' : 'none',
            border: '1.1px solid rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
