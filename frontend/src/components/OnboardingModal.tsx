import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SpritePet } from './SpritePet'
import type { CodexPet } from '../lib/codexPet'
import type { AppMode } from '../lib/petStore'

interface OnboardingModalProps {
  open: boolean
  onSelect: (mode: AppMode) => void
}

// Codex pet metadata constructed inline so the onboarding modal renders
// instantly without waiting for the pets manifest fetch.
const PHOEBE_PET: CodexPet = {
  id: 'phoebe',
  displayName: 'Phoebe',
  description: '',
  spritesheetUrl: '/assets/builtin/phoebe.codex-pet/spritesheet.webp',
}

export function OnboardingModal({ open, onSelect }: OnboardingModalProps) {
  const { t } = useTranslation()
  const preferWebm = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
  const petPreviewSrc = preferWebm
    ? '/assets/builtin/香企鹅/large/webm/idle.webm'
    : '/assets/builtin/香企鹅/large/mov/idle.mov'
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              display: 'flex',
              gap: 20,
              padding: 32,
              borderRadius: 24,
              background: 'linear-gradient(135deg, #1a1a1a 0%, #111 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
              maxWidth: 560,
              width: '90vw',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
              {t('onboarding.chooseModeTitle')}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
              {t('onboarding.chooseModeSubtitle')}
            </p>

            <div style={{ display: 'flex', gap: 16, width: '100%', marginTop: 8, alignItems: 'stretch' }}>
              <CodingModeCard
                title={t('settings.codingMode')}
                description={t('onboarding.codingModeLongDesc')}
                onClick={() => onSelect('coding')}
              />
              <PetModeCard
                title={t('settings.petMode')}
                petPreviewSrc={petPreviewSrc}
                description={t('onboarding.petModeLongDesc')}
                onClick={() => onSelect('pet')}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Recommended primary card. Larger flex weight, accent border, codex
// sprite preview to lean into the agent-monitoring identity.
function CodingModeCard({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        flex: 1.4,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '32px 20px',
        borderRadius: 18,
        background:
          'linear-gradient(160deg, rgba(59,130,246,0.16) 0%, rgba(59,130,246,0.04) 60%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(59,130,246,0.45)',
        boxShadow: '0 0 0 1px rgba(59,130,246,0.12), 0 12px 28px rgba(59,130,246,0.18)',
        cursor: 'pointer',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          padding: '3px 8px',
          borderRadius: 999,
          background: 'rgba(59,130,246,0.18)',
          color: '#93c5fd',
          border: '1px solid rgba(59,130,246,0.35)',
        }}
      >
        {t('onboarding.recommended', '推荐')}
      </span>
      <div
        style={{
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          imageRendering: 'pixelated',
        }}
      >
        <SpritePet pet={PHOEBE_PET} state="idle" size={150} />
      </div>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</span>
      <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
        {description}
      </span>
    </motion.button>
  )
}

// Secondary card. Visually muted (lower opacity, subdued border) so the
// recommended primary stands out, but still clearly clickable.
function PetModeCard({
  title,
  petPreviewSrc,
  description,
  onClick,
}: {
  title: string
  petPreviewSrc: string
  description: string
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, opacity: 1 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '24px 16px',
        borderRadius: 16,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        opacity: 0.78,
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChromaKeyVideo src={petPreviewSrc} size={150} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{title}</span>
      <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
        {description}
      </span>
    </motion.button>
  )
}

function ChromaKeyVideo({ src, size }: { src: string; size: number }) {
  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!isWindows) return
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let rafId = 0
    const draw = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (canvas.width !== size || canvas.height !== size) {
          canvas.width = size
          canvas.height = size
        }
        ctx.clearRect(0, 0, size, size)
        ctx.drawImage(video, 0, 0, size, size)
        const frame = ctx.getImageData(0, 0, size, size)
        const data = frame.data
        for (let i = 0; i < data.length; i += 4) {
          const maxRgb = Math.max(data[i], data[i + 1], data[i + 2])
          if (maxRgb <= 12) {
            data[i + 3] = 0
          } else if (maxRgb < 28) {
            const softAlpha = Math.round(((maxRgb - 12) / 16) * 255)
            if (softAlpha < data[i + 3]) data[i + 3] = softAlpha
          }
        }
        ctx.putImageData(frame, 0, 0)
      }
      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [isWindows, size])

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget
    if (v.src.includes('/large/webm/')) {
      v.src = v.src.replace('/large/webm/', '/large/mov/').replace(/\.webm(\?.*)?$/, '.mov$1')
      v.load()
      v.play().catch(() => {})
    }
  }

  if (!isWindows) {
    return (
      <video
        src={src}
        autoPlay loop muted playsInline
        onError={handleError}
        style={{
          width: size, height: size,
          objectFit: 'contain', pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))',
        }}
      />
    )
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <canvas
        ref={canvasRef}
        width={size} height={size}
        style={{
          width: size, height: size,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))',
        }}
      />
      <video
        ref={videoRef}
        src={src}
        autoPlay loop muted playsInline
        onError={handleError}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: size, height: size,
          opacity: 0, pointerEvents: 'none',
        }}
      />
    </div>
  )
}
