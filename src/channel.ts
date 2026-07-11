export const CHANNEL_NAME = 'typing-animation-bubbles'

export type BubbleMessage = {
  type: 'bubble'
  id: string
  text: string
  wordId: string
  index: number
  total: number
}

export type HelloMessage = { type: 'hello' }
export type HelloAckMessage = { type: 'hello-ack' }
export type DisplayClosingMessage = { type: 'display-closing' }
export type FontScaleMessage = { type: 'font-scale'; scale: number }
export type SpawnWidthMessage = { type: 'spawn-width'; widthPercent: number }

export type ChannelMessage =
  | BubbleMessage
  | HelloMessage
  | HelloAckMessage
  | DisplayClosingMessage
  | FontScaleMessage
  | SpawnWidthMessage

export const createBubbleId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
