/**
 * WAV files from rendered audio: 24-bit PCM, interleaved, little-endian (what every DAW
 * imports). Pure, no dependency: an AudioBuffer's channels (getChannelData) go in, bytes
 * come out.
 */

const BYTES_PER_SAMPLE = 3
const HEADER_BYTES = 44

/** One sample (−1…1, clipped) as a signed 24-bit integer. */
export function toInt24(sample: number): number {
  const s = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0))
  return Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff)
}

/** Channels (all the same length) as a 24-bit PCM WAV file. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const frames = channels[0]?.length ?? 0
  const blockAlign = channels.length * BYTES_PER_SAMPLE
  const dataBytes = frames * blockAlign
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i)
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels.length, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true)
  text(36, 'data')
  view.setUint32(40, dataBytes, true)
  let at = HEADER_BYTES
  for (let i = 0; i < frames; i++) {
    for (const channel of channels) {
      const v = toInt24(channel[i])
      bytes[at] = v & 0xff
      bytes[at + 1] = (v >> 8) & 0xff
      bytes[at + 2] = (v >> 16) & 0xff
      at += BYTES_PER_SAMPLE
    }
  }
  return bytes
}

/** About −80 dBFS: below this the tail is silence. */
export const SILENCE = 1e-4

/**
 * Cut the silent end off a render, never shorter than `minFrames` (the song's last bar, so
 * the file always covers every bar and starts on bar 1). The last audible sample is kept.
 */
export function trimTail(channels: Float32Array[], minFrames: number, threshold = SILENCE): Float32Array[] {
  const frames = channels[0]?.length ?? 0
  let last = -1
  for (const channel of channels) {
    for (let i = frames - 1; i > last; i--) {
      if (Math.abs(channel[i]) > threshold) {
        last = i
        break
      }
    }
  }
  const length = Math.min(frames, Math.max(minFrames, last + 1))
  return channels.map((channel) => channel.subarray(0, length))
}

/**
 * A finished render as a WAV file: its channels from frame `offset` on (the limiter's lookahead
 * delay, so the file starts exactly on bar 1), the silent end cut (never before `end`, the last
 * bar, in seconds after the offset).
 */
export function renderedWav({ buffer, end, offset = 0 }: { buffer: Pick<AudioBuffer, 'numberOfChannels' | 'sampleRate' | 'getChannelData'>; end: number; offset?: number }): Uint8Array {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).subarray(offset))
  return encodeWav(trimTail(channels, Math.round(end * buffer.sampleRate)), buffer.sampleRate)
}
