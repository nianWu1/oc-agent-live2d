import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  isLive2DPet,
  resolveLive2DMotion,
  type CodexPet,
  type CodexPetState,
  type Live2DMotionBinding,
} from '../lib/codexPet'

declare global {
  interface Window {
    Live2DCubismCore?: unknown
  }
}

interface Live2DPetProps {
  pet: CodexPet
  state: CodexPetState
  size: number
  onOneShotEnd?: () => void
  className?: string
  style?: React.CSSProperties
  /** When set, ignore oc-claw state and play this binding (settings studio). */
  forceBinding?: Live2DMotionBinding | null
  /** Surface load failures to the parent (studio). */
  onLoadError?: (message: string) => void
  onLoadOk?: () => void
}

let cubismCorePromise: Promise<void> | null = null

function ensureCubismCore(): Promise<void> {
  if (typeof window !== 'undefined' && window.Live2DCubismCore) {
    return Promise.resolve()
  }
  if (!cubismCorePromise) {
    cubismCorePromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-oc-cubism-core="1"]',
      )
      if (existing) {
        if (window.Live2DCubismCore) {
          resolve()
          return
        }
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () =>
          reject(new Error('Failed to load Cubism Core')),
        )
        return
      }
      const script = document.createElement('script')
      script.src = '/vendor/live2dcubismcore.min.js'
      script.async = true
      script.dataset.ocCubismCore = '1'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Cubism Core'))
      document.head.appendChild(script)
    })
  }
  return cubismCorePromise
}

/**
 * Cubism 4 Live2D renderer for desktop pets. Motion selection is driven by
 * `pet.motionMap` (oc-claw state → Cubism group/index/expression).
 */
export function Live2DPet({
  pet,
  state,
  size,
  onOneShotEnd,
  className,
  style,
  forceBinding = null,
  onLoadError,
  onLoadOk,
}: Live2DPetProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<import('pixi.js').Application | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelRef = useRef<any>(null)
  const stateRef = useRef(state)
  const onOneShotEndRef = useRef(onOneShotEnd)
  const sizeRef = useRef(size)
  const loopTokenRef = useRef(0)
  const forceBindingRef = useRef(forceBinding)
  const [mapRevision, setMapRevision] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const unlisten = listen<{ petId?: string }>('live2d-motion-map-changed', (ev) => {
      if (!ev.payload?.petId || ev.payload.petId === pet.id) {
        setMapRevision((n) => n + 1)
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [pet.id])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onOneShotEndRef.current = onOneShotEnd
  }, [onOneShotEnd])

  useEffect(() => {
    forceBindingRef.current = forceBinding
  }, [forceBinding])

  useEffect(() => {
    sizeRef.current = size
    const app = appRef.current
    const model = modelRef.current
    if (!app || !model) return
    app.renderer.resize(size, size)
    fitModel(model, size)
  }, [size])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    const token = ++loopTokenRef.current
    void runMotionLoop(
      model,
      pet,
      state,
      token,
      loopTokenRef,
      onOneShotEndRef,
      stateRef,
      forceBindingRef,
    )
  }, [state, pet, forceBinding, mapRevision])

  useEffect(() => {
    if (!isLive2DPet(pet) || !pet.modelUrl) return
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let app: import('pixi.js').Application | null = null
    setLoadError(null)

    ;(async () => {
      try {
        await ensureCubismCore()
        const PIXI = await import('pixi.js')
        const { Live2DModel } = await import('pixi-live2d-display/cubism4')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Live2DModel.registerTicker((PIXI as any).Ticker)

        if (cancelled || !hostRef.current) return

        app = new PIXI.Application({
          width: sizeRef.current,
          height: sizeRef.current,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        })
        host.innerHTML = ''
        host.appendChild(app.view as HTMLCanvasElement)
        appRef.current = app

        console.info('[Live2DPet] loading', pet.id, pet.modelUrl)
        const model = await Live2DModel.from(pet.modelUrl!, {
          autoInteract: false,
        })
        if (cancelled) {
          model.destroy()
          return
        }
        modelRef.current = model
        app.stage.addChild(model)
        fitModel(model, sizeRef.current)
        setLoadError(null)
        onLoadOk?.()
        const token = ++loopTokenRef.current
        void runMotionLoop(
          model,
          pet,
          stateRef.current,
          token,
          loopTokenRef,
          onOneShotEndRef,
          stateRef,
          forceBindingRef,
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[Live2DPet] load failed:', pet.id, pet.modelUrl, e)
        setLoadError(msg)
        onLoadError?.(msg)
      }
    })()

    return () => {
      cancelled = true
      loopTokenRef.current += 1
      try {
        modelRef.current?.destroy?.(true)
      } catch {
        /* ignore */
      }
      modelRef.current = null
      try {
        // Never pass texture/baseTexture:true — this webview is shared with the
        // main mini UI. Aggressively freeing GL resources after settings
        // preview unmount left the mascot/notch UI frozen until process kill.
        app?.destroy(true, { children: true })
      } catch {
        /* ignore */
      }
      appRef.current = null
      if (host) host.innerHTML = ''
    }
  }, [pet.id, pet.modelUrl])

  const height = Math.round(size * (208 / 192))

  return (
    <div
      className={className}
      style={{
        width: size,
        height,
        overflow: 'hidden',
        pointerEvents: 'none',
        position: 'relative',
        ...style,
      }}
    >
      <div
        ref={hostRef}
        style={{
          width: size,
          height: size,
          marginTop: Math.max(0, height - size),
        }}
      />
      {loadError && (
        <div
          style={{
            position: 'absolute',
            inset: 8,
            fontSize: 10,
            lineHeight: 1.35,
            color: '#fda4af',
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 8,
            padding: 8,
            overflow: 'auto',
            pointerEvents: 'none',
          }}
        >
          模型加载失败
          <br />
          {loadError}
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fitModel(model: any, size: number) {
  try {
    model.anchor?.set?.(0.5, 1)
  } catch {
    /* ignore */
  }
  model.scale?.set?.(1)
  const bounds = model.getBounds?.()
  const bw = Math.max(1, bounds?.width ?? size)
  const bh = Math.max(1, bounds?.height ?? size)
  const scale = Math.min(size / bw, size / bh) * 0.92
  model.scale?.set?.(scale)
  model.x = size / 2
  model.y = size
}

/**
 * `model.motion()` resolves when playback *starts*, not when it ends.
 * Wait for MotionManager `motionFinish` (or poll `isFinished`) so loop /
 * one-shot timing matches the Cubism motion duration.
 */
function waitForMotionFinish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  token: number,
  loopTokenRef: React.MutableRefObject<number>,
): Promise<void> {
  return new Promise((resolve) => {
    if (token !== loopTokenRef.current) {
      resolve()
      return
    }
    const mm = model?.internalModel?.motionManager
    if (!mm) {
      resolve()
      return
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      try {
        mm.off?.('motionFinish', onFinish)
      } catch {
        /* ignore */
      }
      resolve()
    }
    const onFinish = () => finish()

    // Defer one frame so a freshly started motion is not mistaken for the
    // previous motion's finished state.
    requestAnimationFrame(() => {
      if (token !== loopTokenRef.current) {
        finish()
        return
      }
      if (typeof mm.once === 'function') {
        mm.once('motionFinish', onFinish)
      }

      const startedAt = performance.now()
      const poll = () => {
        if (settled) return
        if (token !== loopTokenRef.current) {
          finish()
          return
        }
        try {
          if (mm.isFinished?.()) {
            finish()
            return
          }
        } catch {
          finish()
          return
        }
        // Safety valve — some motions never emit finish (or stay reserved).
        if (performance.now() - startedAt > 120_000) {
          finish()
          return
        }
        requestAnimationFrame(poll)
      }
      requestAnimationFrame(poll)
    })
  })
}

async function runMotionLoop(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  pet: CodexPet,
  state: CodexPetState,
  token: number,
  loopTokenRef: React.MutableRefObject<number>,
  onOneShotEndRef: React.MutableRefObject<(() => void) | undefined>,
  stateRef: React.MutableRefObject<CodexPetState>,
  forceBindingRef: React.MutableRefObject<Live2DMotionBinding | null | undefined>,
) {
  const forced = forceBindingRef.current
  const binding = forced ?? resolveLive2DMotion(pet, state)
  applyExpression(model, binding)

  const motionGroupsKnown = pet.availableMotions != null
  const hasAnyMotion = Object.values(pet.availableMotions ?? {}).some(
    (files) => Array.isArray(files) && files.length > 0,
  )
  // Packs like maho / MAY ship only moc+texture (no motion3). Keep the
  // static model on stage; do not spam failed motion() calls.
  if (!forced && motionGroupsKnown && !hasAnyMotion) {
    return
  }

  const priority = forced ? 3 : state === 'jumping' ? 3 : 2
  const index =
    typeof binding.index === 'number' && Number.isFinite(binding.index)
      ? binding.index
      : undefined

  let started = false
  try {
    try {
      model.internalModel?.motionManager?.stopAllMotions?.()
    } catch {
      /* ignore */
    }

    const result = model.motion?.(binding.group, index, priority)
    if (result && typeof result.then === 'function') {
      started = !!(await result)
    } else {
      started = result !== false
    }
  } catch (e) {
    console.warn('[Live2DPet] motion failed:', binding, e)
  }

  if (token !== loopTokenRef.current) return

  if (!started) {
    console.warn('[Live2DPet] motion did not start:', binding)
    return
  }

  await waitForMotionFinish(model, token, loopTokenRef)

  if (token !== loopTokenRef.current) return

  if (!forced && state === 'jumping') {
    onOneShotEndRef.current?.()
    return
  }

  // Studio forceBinding or looping oc-claw states keep replaying.
  const stillForced =
    !!forced &&
    forceBindingRef.current &&
    forceBindingRef.current.group === forced.group &&
    forceBindingRef.current.index === forced.index &&
    forceBindingRef.current.expression === forced.expression

  if (forced ? stillForced && (forced.loop ?? true) : binding.loop && stateRef.current === state) {
    if (token !== loopTokenRef.current) return
    if (forced) {
      if (!forceBindingRef.current) return
    } else if (stateRef.current !== state) {
      return
    }
    void runMotionLoop(
      model,
      pet,
      state,
      token,
      loopTokenRef,
      onOneShotEndRef,
      stateRef,
      forceBindingRef,
    )
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyExpression(model: any, binding: Live2DMotionBinding) {
  if (!binding.expression) return
  try {
    model.expression?.(binding.expression)
  } catch (e) {
    console.warn('[Live2DPet] expression failed:', binding.expression, e)
  }
}
