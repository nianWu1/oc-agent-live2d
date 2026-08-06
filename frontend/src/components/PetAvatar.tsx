import { SpritePet } from './SpritePet'
import { Live2DPet } from './Live2DPet'
import { isLive2DPet, type CodexPet, type CodexPetState } from '../lib/codexPet'

interface PetAvatarProps {
  pet: CodexPet
  state: CodexPetState
  size: number
  onOneShotEnd?: () => void
  loop?: boolean
  className?: string
  style?: React.CSSProperties
}

/** Renders either a sprite atlas pet or a Cubism Live2D pet. */
export function PetAvatar({
  pet,
  state,
  size,
  onOneShotEnd,
  loop,
  className,
  style,
}: PetAvatarProps) {
  if (isLive2DPet(pet)) {
    return (
      <Live2DPet
        pet={pet}
        state={state}
        size={size}
        onOneShotEnd={onOneShotEnd}
        className={className}
        style={style}
      />
    )
  }
  return (
    <SpritePet
      pet={pet}
      state={state}
      size={size}
      onOneShotEnd={onOneShotEnd}
      loop={loop}
      className={className}
      style={style}
    />
  )
}

/** Lightweight thumbnail for pickers / lists (avoids spinning up Pixi). */
export function PetThumb({
  pet,
  size = 40,
  className,
}: {
  pet: CodexPet
  size?: number
  className?: string
}) {
  if (isLive2DPet(pet)) {
    return (
      <img
        src={pet.spritesheetUrl}
        alt={pet.displayName}
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          objectPosition: 'top center',
          borderRadius: 8,
          display: 'block',
        }}
        draggable={false}
      />
    )
  }
  return <SpritePet pet={pet} state="idle" size={size} className={className} />
}
