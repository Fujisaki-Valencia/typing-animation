import { useCallback, useEffect, useRef, useState } from 'react'
import './DisplayView.css'
import { BubbleMessage, CHANNEL_NAME, ChannelMessage } from './channel'

type BubbleKind = 'char' | 'sparkle'

interface Bubble {
  id: string
  text: string
  kind: BubbleKind
  left: number
  bottomOffsetPx: number
  fontSize: number
  duration: number
  riseDelay: number
  riseDistancePx: number
  rotate: number
}

interface WordProfile {
  left: number
  fontSize: number
  charAdvance: number
  duration: number
  startTime: number
  riseDistancePx: number
}

interface ActiveSlot {
  left: number
  expiresAt: number
}

// approximate vertical advance per character (tategaki column), relative to font size
const CHAR_ADVANCE_RATIO = 1.05

const DEFAULT_SPAWN_WIDTH_PERCENT = 50
const MIN_GAP_PERCENT = 9
const PLACEMENT_ATTEMPTS = 24

// bubbles are never allowed to rise past this fraction of the viewport height,
// so long/large-font words can't climb above the visible screen
const SAFE_MAX_PERCENT = 92
const MIN_RISE_PERCENT_CHAR = 18
const MIN_RISE_PERCENT_SPARKLE = 6
// how tall a word's vertical column (tategaki stacking) may be, before it even
// starts rising -- without this, long words at large font sizes could start
// off-screen above the top on their own
const MAX_COLUMN_PERCENT = 55

const SPARKLE_SYMBOLS = ['*', '+', '・']

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

// getBoundingClientRect().top reflects the glyph's own rendered height too, not
// just its anchor position -- budget for that so the visible top edge, not just
// the CSS anchor point, stays under SAFE_MAX_PERCENT of the viewport
const glyphAllowancePx = (fontSize: number) => fontSize * 1.3

// the highest an element's bottom-anchor (bottomOffsetPx + rise) may reach,
// once its own rendered height is taken into account
const safeMaxAnchorPx = (fontSize: number) =>
  Math.max(
    window.innerHeight * (SAFE_MAX_PERCENT / 100) - glyphAllowancePx(fontSize),
    window.innerHeight * 0.2
  )

// caps how far up (in px) something starting at startBottomOffsetPx may rise
// before its top edge would cross the safe ceiling
const safeRiseDistancePx = (
  desiredRisePx: number,
  startBottomOffsetPx: number,
  minRisePercent: number,
  fontSize: number
) => {
  const ceilingPx = safeMaxAnchorPx(fontSize)
  const minRisePx = window.innerHeight * (minRisePercent / 100)
  const allowedRisePx = Math.max(ceilingPx - startBottomOffsetPx, minRisePx)
  return -Math.min(desiredRisePx, allowedRisePx)
}

// picks a left position for a new word that keeps it clear of columns still rising,
// so back-to-back typing doesn't spawn overlapping columns
const pickLeft = (activeSlots: ActiveSlot[], spawnMin: number, spawnMax: number) => {
  let best = randomBetween(spawnMin, spawnMax)
  let bestDistance = -Infinity

  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const candidate = randomBetween(spawnMin, spawnMax)
    const distance =
      activeSlots.length === 0
        ? Infinity
        : Math.min(...activeSlots.map(slot => Math.abs(slot.left - candidate)))

    if (distance > bestDistance) {
      bestDistance = distance
      best = candidate
    }
    if (distance >= MIN_GAP_PERCENT) break
  }

  return best
}

const createWordProfile = (
  activeSlots: ActiveSlot[],
  fontScale: number,
  spawnWidthPercent: number,
  total: number
): WordProfile => {
  const now = performance.now()
  const duration = randomBetween(2.4, 4.2)
  const spawnMin = 50 - spawnWidthPercent / 2
  const spawnMax = 50 + spawnWidthPercent / 2
  const left = pickLeft(activeSlots.filter(slot => slot.expiresAt > now), spawnMin, spawnMax)
  const fontSize = randomBetween(28, 96) * fontScale

  // the first-typed character sits highest in the column (see createCharBubble);
  // half the word's characters span from center to that topmost character
  const topmostHalfSpan = (total - 1) / 2
  const idealCharAdvance = fontSize * CHAR_ADVANCE_RATIO
  const maxColumnPx = safeMaxAnchorPx(fontSize) * (MAX_COLUMN_PERCENT / SAFE_MAX_PERCENT)
  // compress letter-spacing for very long/large-font words so the column itself
  // never starts taller than the safe budget, regardless of rise animation
  const charAdvance =
    topmostHalfSpan > 0
      ? Math.min(idealCharAdvance, maxColumnPx / topmostHalfSpan)
      : idealCharAdvance
  const topmostStartOffsetPx = topmostHalfSpan * charAdvance

  const riseDistancePx = safeRiseDistancePx(
    window.innerHeight * 0.5,
    topmostStartOffsetPx,
    MIN_RISE_PERCENT_CHAR,
    fontSize
  )

  return {
    left,
    fontSize,
    charAdvance,
    duration,
    startTime: now,
    riseDistancePx
  }
}

const createCharBubble = (message: BubbleMessage, profile: WordProfile): Bubble => {
  // first-typed character sits at the top of the column, later characters trail below it
  const bottomOffsetPx = ((message.total - 1) / 2 - message.index) * profile.charAdvance
  // later characters appear after a delay; a matching negative rise-delay keeps
  // the whole column climbing on the same clock instead of drifting apart
  const riseDelay = -(performance.now() - profile.startTime) / 1000
  return {
    id: message.id,
    text: message.text,
    kind: 'char',
    left: profile.left,
    bottomOffsetPx,
    fontSize: profile.fontSize,
    duration: profile.duration,
    riseDelay,
    riseDistancePx: profile.riseDistancePx,
    rotate: 0
  }
}

const createSparkles = (
  message: BubbleMessage,
  profile: WordProfile,
  fontScale: number
): Bubble[] => {
  const charBottomOffsetPx = ((message.total - 1) / 2 - message.index) * profile.charAdvance
  const count = Math.random() < 0.5 ? 1 : 2

  return Array.from({ length: count }, (_, i) => {
    const bottomOffsetPx =
      charBottomOffsetPx + randomBetween(-profile.charAdvance * 0.4, profile.charAdvance * 0.4)
    const sparkleFontSize = randomBetween(8, 18) * fontScale
    return {
      id: `${message.id}-sparkle-${i}`,
      text: SPARKLE_SYMBOLS[Math.floor(Math.random() * SPARKLE_SYMBOLS.length)],
      kind: 'sparkle' as const,
      left: profile.left + randomBetween(-4, 4),
      bottomOffsetPx,
      fontSize: sparkleFontSize,
      duration: randomBetween(1, 2),
      riseDelay: 0,
      riseDistancePx: safeRiseDistancePx(
        randomBetween(10, 22) / 100 * window.innerHeight,
        bottomOffsetPx,
        MIN_RISE_PERCENT_SPARKLE,
        sparkleFontSize
      ),
      rotate: randomBetween(-25, 25)
    }
  })
}

const openInputWindow = () => {
  const url = new URL(window.location.href)
  url.searchParams.set('window', 'input')
  window.open(url.toString(), 'typing-animation-input', 'width=480,height=320')
}

function DisplayView() {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [inverted, setInverted] = useState(false)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const wordProfiles = useRef<Map<string, WordProfile>>(new Map())
  const activeSlots = useRef<ActiveSlot[]>([])
  const fontScale = useRef(1)
  const spawnWidthPercent = useRef(DEFAULT_SPAWN_WIDTH_PERCENT)

  useEffect(() => {
    // avoid a first-paint hiccup (and the resulting wobble desync) on the very
    // first bubble by warming up the custom font before any bubble can appear
    document.fonts.load('1em "Yonaga Old Mincho"')
  }, [])

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const message = event.data
      if (message.type === 'bubble') {
        let profile = wordProfiles.current.get(message.wordId)
        if (!profile) {
          const now = performance.now()
          activeSlots.current = activeSlots.current.filter(slot => slot.expiresAt > now)
          profile = createWordProfile(
            activeSlots.current,
            fontScale.current,
            spawnWidthPercent.current,
            message.total
          )
          wordProfiles.current.set(message.wordId, profile)
          activeSlots.current.push({
            left: profile.left,
            expiresAt: now + profile.duration * 1000
          })
        }
        if (message.index === message.total - 1) {
          wordProfiles.current.delete(message.wordId)
        }
        const charBubble = createCharBubble(message, profile)
        const sparkles = createSparkles(message, profile, fontScale.current)
        setBubbles(prev => [...prev, charBubble, ...sparkles])
      } else if (message.type === 'hello') {
        channel.postMessage({ type: 'hello-ack' })
      } else if (message.type === 'font-scale') {
        fontScale.current = message.scale
      } else if (message.type === 'spawn-width') {
        spawnWidthPercent.current = message.widthPercent
      }
    }

    channel.postMessage({ type: 'hello-ack' })

    const handleBeforeUnload = () => {
      channel.postMessage({ type: 'display-closing' })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      channel.close()
    }
  }, [])

  const removeBubble = useCallback((id: string) => {
    setBubbles(prev => prev.filter(b => b.id !== id))
  }, [])

  const toggleInverted = useCallback(() => setInverted(v => !v), [])

  return (
    <div
      className="display-view"
      style={
        {
          '--background-color': inverted ? '#ffffff' : '#000000',
          '--bubble-color': inverted ? '#000000' : '#ffffff'
        } as React.CSSProperties
      }
    >
      <div className="bubble-field">
        {bubbles.map(bubble => (
          <div
            key={bubble.id}
            className="bubble-outer"
            style={
              {
                '--x': `${bubble.left}%`,
                '--y-offset': `${bubble.bottomOffsetPx}px`,
                '--duration': `${bubble.duration}s`,
                '--rise-delay': `${bubble.riseDelay}s`,
                '--rise-distance': `${bubble.riseDistancePx}px`
              } as React.CSSProperties
            }
            onAnimationEnd={() => bubble.kind === 'char' && removeBubble(bubble.id)}
          >
            <div
              className={`bubble-inner${bubble.kind === 'sparkle' ? ' sparkle' : ''}`}
              style={
                {
                  fontSize: `${bubble.fontSize}px`,
                  '--rotate': `${bubble.rotate}deg`
                } as React.CSSProperties
              }
              onAnimationEnd={() => bubble.kind === 'sparkle' && removeBubble(bubble.id)}
            >
              {bubble.text}
            </div>
          </div>
        ))}
      </div>
      <div className="controls-tray">
        <button
          type="button"
          className="open-input-button"
          onClick={openInputWindow}
          title="入力ウィンドウを開く"
        >
          ⌨︎
        </button>
        <button
          type="button"
          className="invert-toggle"
          onClick={toggleInverted}
          aria-label="配色を反転"
          title="配色を反転"
        />
      </div>
    </div>
  )
}

export default DisplayView
