export type PetStatusTone =
  | 'idle'
  | 'working'
  | 'waiting'
  | 'thinking'
  | 'tool'
  | 'compacting'

const TONE_STYLE: Record<
  PetStatusTone,
  { bg: string; color: string; pulse?: boolean }
> = {
  idle: { bg: 'rgba(55, 65, 81, 0.88)', color: '#e5e7eb' },
  working: { bg: 'rgba(16, 185, 129, 0.92)', color: '#052e1a' },
  thinking: { bg: 'rgba(56, 189, 248, 0.92)', color: '#0c4a6e' },
  tool: { bg: 'rgba(52, 211, 153, 0.95)', color: '#064e3b' },
  waiting: { bg: 'rgba(245, 158, 11, 0.95)', color: '#111827', pulse: true },
  compacting: { bg: 'rgba(167, 139, 250, 0.95)', color: '#2e1065' },
}

interface PetStatusBubbleProps {
  label: string
  tone?: PetStatusTone
  /** Extra detail shown on hover (e.g. full tool name). */
  title?: string
}

/** Compact status pill rendered above the desktop pet. */
export function PetStatusBubble({
  label,
  tone = 'idle',
  title,
}: PetStatusBubbleProps) {
  const style = TONE_STYLE[tone] ?? TONE_STYLE.idle
  return (
    <>
      <div
        style={{
          position: 'absolute',
          // Keep inside the mascot window so the OS webview does not clip it.
          top: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          pointerEvents: 'none',
          maxWidth: 'min(220px, 96%)',
          padding: '3px 9px',
          borderRadius: 999,
          background: style.bg,
          color: style.color,
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
          animation: style.pulse ? 'ocPetStatusPulse 1.2s ease-in-out infinite' : undefined,
          border: '1px solid rgba(255,255,255,0.18)',
        }}
        title={title || label}
      >
        {label}
      </div>
      {style.pulse && (
        <style>{`
          @keyframes ocPetStatusPulse {
            0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
            50% { transform: translateX(-50%) scale(1.05); opacity: 0.9; }
          }
        `}</style>
      )}
    </>
  )
}
