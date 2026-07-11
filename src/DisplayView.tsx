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
  riseDistanceVh: number
  rotate: number
}

interface WordProfile {
  left: number
  fontSize: number
  duration: number
  startTime: number
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

const SPARKLE_SYMBOLS = ['*', '+', '・']

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

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
  spawnWidthPercent: number
): WordProfile => {
  const now = performance.now()
  const duration = randomBetween(2.4, 4.2)
  const spawnMin = 50 - spawnWidthPercent / 2
  const spawnMax = 50 + spawnWidthPercent / 2
  const left = pickLeft(activeSlots.filter(slot => slot.expiresAt > now), spawnMin, spawnMax)

  return {
    left,
    fontSize: randomBetween(28, 96) * fontScale,
    duration,
    startTime: now
  }
}

const createCharBubble = (message: BubbleMessage, profile: WordProfile): Bubble => {
  const charAdvance = profile.fontSize * CHAR_ADVANCE_RATIO
  // first-typed character sits at the top of the column, later characters trail below it
  const bottomOffsetPx = ((message.total - 1) / 2 - message.index) * charAdvance
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
    riseDistanceVh: -50,
    rotate: 0
  }
}

const createSparkles = (
  message: BubbleMessage,
  profile: WordProfile,
  fontScale: number
): Bubble[] => {
  const charAdvance = profile.fontSize * CHAR_ADVANCE_RATIO
  const charBottomOffsetPx = ((message.total - 1) / 2 - message.index) * charAdvance
  const count = Math.random() < 0.5 ? 1 : 2

  return Array.from({ length: count }, (_, i) => ({
    id: `${message.id}-sparkle-${i}`,
    text: SPARKLE_SYMBOLS[Math.floor(Math.random() * SPARKLE_SYMBOLS.length)],
    kind: 'sparkle' as const,
    left: profile.left + randomBetween(-4, 4),
    bottomOffsetPx: charBottomOffsetPx + randomBetween(-charAdvance * 0.4, charAdvance * 0.4),
    fontSize: randomBetween(8, 18) * fontScale,
    duration: randomBetween(1, 2),
    riseDelay: 0,
    riseDistanceVh: -randomBetween(10, 22),
    rotate: randomBetween(-25, 25)
  }))
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
          profile = createWordProfile(activeSlots.current, fontScale.current, spawnWidthPercent.current)
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
                '--rise-distance': `${bubble.riseDistanceVh}vh`
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
