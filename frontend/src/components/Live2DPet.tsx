import { useEffect, useRef } from 'react'
import type { CodexPet, CodexPetState } from '../lib/codexPet'
import { isLive2DPet } from '../lib/codexPet'

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

function motionGroupFor(pet: CodexPet, state: CodexPetState): string {
  const g = pet.motionGroups
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
}

/**
 * Cubism 4 Live2D renderer for desktop pets. Uses pixi-live2d-display +
 * Live2D Cubism Core Web. Models are expected under /assets/live2d/.
 */
export function Live2DPet({
  pet,
  state,
  size,
  onOneShotEnd,
  className,
  style,
}: Live2DPetProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<import('pixi.js').Application | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelRef = useRef<any>(null)
  const stateRef = useRef(state)
  const onOneShotEndRef = useRef(onOneShotEnd)
  const sizeRef = useRef(size)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onOneShotEndRef.current = onOneShotEnd
  }, [onOneShotEnd])

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
    void playMotion(model, pet, state, onOneShotEndRef)
  }, [state, pet])

  useEffect(() => {
    if (!isLive2DPet(pet) || !pet.modelUrl) return
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let app: import('pixi.js').Application | null = null

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
        void playMotion(model, pet, stateRef.current, onOneShotEndRef)
      } catch (e) {
        console.warn('[Live2DPet] load failed:', e)
      }
    })()

    return () => {
      cancelled = true
      try {
        modelRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      modelRef.current = null
      try {
        app?.destroy(true, { children: true, texture: true, baseTexture: true })
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
  // Start from a neutral scale then fit by bounds.
  model.scale?.set?.(1)
  const bounds = model.getBounds?.()
  const bw = Math.max(1, bounds?.width ?? size)
  const bh = Math.max(1, bounds?.height ?? size)
  const scale = Math.min(size / bw, size / bh) * 0.92
  model.scale?.set?.(scale)
  model.x = size / 2
  model.y = size
}

async function playMotion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  pet: CodexPet,
  state: CodexPetState,
  onOneShotEndRef: React.MutableRefObject<(() => void) | undefined>,
) {
  const group = motionGroupFor(pet, state)
  try {
    const priority = state === 'jumping' ? 3 : 2
    const result = model.motion?.(group, undefined, priority)
    if (state === 'jumping' && result && typeof result.then === 'function') {
      await result
      onOneShotEndRef.current?.()
    }
  } catch (e) {
    // Empty group "" is valid for Mao; unknown groups should not crash.
    console.warn('[Live2DPet] motion failed:', group, e)
    if (state === 'jumping') onOneShotEndRef.current?.()
  }
}
