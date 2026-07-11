import {
  ChangeEventHandler,
  CompositionEventHandler,
  KeyboardEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import './InputView.css'
import { CHANNEL_NAME, ChannelMessage, createBubbleId } from './channel'

const RETRY_INTERVAL_MS = 2000
const STAGGER_MIN_MS = 180
const STAGGER_MAX_MS = 350

const FONT_SCALE_MIN = 0.4
const FONT_SCALE_MAX = 2.5

const SPAWN_WIDTH_MIN = 10
const SPAWN_WIDTH_MAX = 100
const SPAWN_WIDTH_DEFAULT = 50

function InputView() {
  const [buffer, setBuffer] = useState('')
  const [connected, setConnected] = useState(false)
  const [fontScale, setFontScale] = useState(1)
  const [spawnWidth, setSpawnWidth] = useState(SPAWN_WIDTH_DEFAULT)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const isComposing = useRef(false)
  const refInput = useRef<HTMLTextAreaElement>(null)
  const bufferRef = useRef('')
  const staggerTimeouts = useRef<number[]>([])

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const message = event.data
      if (message.type === 'hello-ack') {
        setConnected(true)
      } else if (message.type === 'display-closing') {
        setConnected(false)
      }
    }

    channel.postMessage({ type: 'hello' })
    const retry = window.setInterval(() => {
      channel.postMessage({ type: 'hello' })
    }, RETRY_INTERVAL_MS)

    return () => {
      window.clearInterval(retry)
      channel.close()
      staggerTimeouts.current.forEach(window.clearTimeout)
      staggerTimeouts.current = []
    }
  }, [])

  useEffect(() => {
    refInput.current?.focus()
  }, [])

  const sendBubble = useCallback(
    (text: string, wordId: string, index: number, total: number) => {
      channelRef.current?.postMessage({
        type: 'bubble',
        id: createBubbleId(),
        text,
        wordId,
        index,
        total
      })
    },
    []
  )

  const flushBuffer = useCallback(() => {
    const trimmed = bufferRef.current.trim()
    const chars = Array.from(trimmed).filter(char => char.trim().length > 0)
    const wordId = createBubbleId()
    const total = chars.length

    let elapsed = 0
    chars.forEach((char, index) => {
      const timeoutId = window.setTimeout(() => sendBubble(char, wordId, index, total), elapsed)
      staggerTimeouts.current.push(timeoutId)
      elapsed += STAGGER_MIN_MS + Math.random() * (STAGGER_MAX_MS - STAGGER_MIN_MS)
    })

    bufferRef.current = ''
    setBuffer('')
  }, [sendBubble])

  const handleChange: ChangeEventHandler<HTMLTextAreaElement> = e => {
    bufferRef.current = e.target.value
    setBuffer(e.target.value)
  }

  const handleCompositionStart: CompositionEventHandler<HTMLTextAreaElement> = () => {
    isComposing.current = true
  }

  const handleCompositionEnd: CompositionEventHandler<HTMLTextAreaElement> = e => {
    isComposing.current = false
    bufferRef.current = e.currentTarget.value
    flushBuffer()
  }

  const handleFontScaleChange: ChangeEventHandler<HTMLInputElement> = e => {
    const scale = Number(e.target.value)
    setFontScale(scale)
    channelRef.current?.postMessage({ type: 'font-scale', scale })
  }

  const handleSpawnWidthChange: ChangeEventHandler<HTMLInputElement> = e => {
    const widthPercent = Number(e.target.value)
    setSpawnWidth(widthPercent)
    channelRef.current?.postMessage({ type: 'spawn-width', widthPercent })
  }

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = e => {
    if (isComposing.current) return

    if (e.key === ' ') {
      e.preventDefault()
      flushBuffer()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      flushBuffer()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      bufferRef.current = ''
      setBuffer('')
    }
  }

  return (
    <div className="input-view">
      <div className={`status ${connected ? 'status-connected' : 'status-waiting'}`}>
        {connected ? '● 表示ウィンドウに接続中' : '○ 表示ウィンドウを待機中…'}
      </div>
      <label className="font-scale">
        文字サイズ: {Math.round(fontScale * 100)}%
        <input
          type="range"
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={0.1}
          value={fontScale}
          onChange={handleFontScaleChange}
        />
      </label>
      <label className="font-scale">
        表示する幅: {Math.round(spawnWidth)}%
        <input
          type="range"
          min={SPAWN_WIDTH_MIN}
          max={SPAWN_WIDTH_MAX}
          step={5}
          value={spawnWidth}
          onChange={handleSpawnWidthChange}
        />
      </label>
      <textarea
        ref={refInput}
        className="input-textarea"
        value={buffer}
        placeholder="ここに入力すると、スペース/Enter/変換確定のタイミングで泡になって浮かびます"
        autoComplete="off"
        spellCheck={false}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
      <p className="hint">
        Space / Enter / 日本語変換確定でひとかたまりが泡になります。Escで入力中の文字を破棄。
      </p>
    </div>
  )
}

export default InputView
