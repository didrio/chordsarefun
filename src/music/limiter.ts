/**
 * The master limiter's DSP, pure (no Web Audio): a lookahead brickwall limiter, like the one on
 * a DAW's master channel. The audio is delayed by the lookahead, so the limiter sees every peak
 * coming and turns the gain down smoothly *before* it arrives: nothing passes the ceiling, and
 * the peak isn't clipped (no crunch). Quieter audio passes untouched.
 *
 * Why our own: Web Audio's DynamicsCompressor (behind Tone.Limiter) has a soft knee, a ratio of
 * at most 20 and automatic makeup gain, so it's never a brickwall (Pop peaked at +4 dBFS through
 * it). This runs in an AudioWorklet (limiterWorkletSource); keeping it here makes it testable.
 */

export const LIMITER = {
  /** The output never goes above this: −1 dBFS leaves room for MP3/AAC conversion and inter-sample peaks. */
  ceilingDb: -1,
  /** How far ahead it looks, in seconds: the attack. 5 ms turns a kick down without audible distortion. */
  lookahead: 0.005,
  /**
   * How long the gain takes to come back up after a peak (seconds, time constant). 50 ms: back
   * before the next 8th note, so held chords don't pump after every kick, and slow enough not to
   * distort bass. Measured (T28): shorter barely keeps more loudness (10 ms: ~0.5 dB).
   */
  release: 0.05,
}

/** The ceiling as a sample value (about 0.891). */
export const LIMITER_CEILING = 10 ** (LIMITER.ceilingDb / 20)

/** The delay the limiter adds, in frames (an export trims it off the start). */
export const limiterLatency = (sampleRate: number) => Math.max(1, Math.round(LIMITER.lookahead * sampleRate))

export type Limiter = {
  /**
   * Limit one block. `input` and `output` are channels of equal length; channels missing from
   * the input (nothing connected) are silence. Every channel gets the same gain (linked), so
   * the stereo image never shifts.
   */
  process: (input: Float32Array[], output: Float32Array[]) => void
}

/**
 * A limiter for one stream at this sample rate. Per sample, the gain the peak needs
 * (ceiling / peak, at most 1) is
 *   1. held at the lowest value seen over the lookahead window (so it's down before the peak),
 *   2. released: down instantly, back up exponentially (the release),
 *   3. averaged over the lookahead window (a smooth attack ramp instead of a step),
 * and applied to the audio delayed by the lookahead. Every value averaged in step 3 is at most
 * the gain the delayed sample needs (it was held over a window containing it), so the average
 * is too: a guaranteed ceiling, not an approximate one. A last clamp only guards against float
 * rounding.
 *
 * Self-contained on purpose (nothing from outside but its arguments and globals like Math): the
 * worklet is built from its source text (limiterWorkletSource).
 */
export function createLimiter(sampleRate: number, settings: typeof LIMITER): Limiter {
  const lookahead = Math.max(1, Math.round(settings.lookahead * sampleRate)) // = limiterLatency
  const size = lookahead + 1 // the window: this sample and the `lookahead` before it
  const ceiling = 10 ** (settings.ceilingDb / 20)
  const release = Math.exp(-1 / (settings.release * sampleRate))

  // Audio delay lines, made for the channel count on first use.
  let delays: Float32Array[] = []
  let pos = 0 // write position in the delay lines (and the average's ring)

  // Sliding minimum of the needed gain (a monotonic queue: values increase from head to tail).
  const qValue = new Float64Array(size + 1)
  const qIndex = new Float64Array(size + 1)
  let qHead = 0
  let qLength = 0
  let n = 0 // samples seen

  let released = 1
  // Moving average of the released gain over the window.
  const ring = new Float64Array(size).fill(1)
  let ringPos = 0
  let sum = size

  return {
    process(input, output) {
      const channels = output.length
      if (delays.length !== channels) {
        delays = Array.from({ length: channels }, () => new Float32Array(lookahead))
        pos = 0
      }
      const frames = output[0]?.length ?? 0
      for (let i = 0; i < frames; i++) {
        let peak = 0
        for (let c = 0; c < channels; c++) {
          const v = Math.abs(input[c]?.[i] ?? 0)
          if (v > peak) peak = v
        }
        const need = peak > ceiling ? ceiling / peak : 1

        // 1. Hold: the lowest needed gain over the last `size` samples.
        while (qLength > 0 && qValue[(qHead + qLength - 1) % (size + 1)] >= need) qLength--
        qValue[(qHead + qLength) % (size + 1)] = need
        qIndex[(qHead + qLength) % (size + 1)] = n
        qLength++
        if (qIndex[qHead] <= n - size) {
          qHead = (qHead + 1) % (size + 1)
          qLength--
        }
        const held = qValue[qHead]

        // 2. Release: instant down, exponential back up (never above the held value).
        released = held < released ? held : held + (released - held) * release

        // 3. Smooth attack: the average over the window.
        sum += released - ring[ringPos]
        ring[ringPos] = released
        ringPos = (ringPos + 1) % size
        if (ringPos === 0) {
          // Re-add from scratch once per window, so rounding never builds up (back at unity, exactly 1).
          sum = 0
          for (let k = 0; k < size; k++) sum += ring[k]
        }
        const gain = Math.min(1, sum / size)

        for (let c = 0; c < channels; c++) {
          const delayed = delays[c][pos]
          delays[c][pos] = input[c]?.[i] ?? 0
          const out = delayed * gain
          output[c][i] = out > ceiling ? ceiling : out < -ceiling ? -ceiling : out
        }
        pos = (pos + 1) % lookahead
        n++
      }
    },
  }
}

/**
 * The AudioWorklet module (a processor named "limiter") as source text, for a Blob URL: the
 * processor runs createLimiter on the audio thread. Built from createLimiter's own source rather
 * than a separate worklet file, because Tone's audio context (standardized-audio-context) wraps
 * a worklet module's source in a function, so the module can't `import` anything: this is how
 * Tone ships its own worklets. A "stop" message ends the processor, so a disposed graph's is let go.
 */
export function limiterWorkletSource(): string {
  return `const createLimiter = ${createLimiter.toString()};
class LimiterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.limiter = createLimiter(sampleRate, ${JSON.stringify(LIMITER)});
    this.stopped = false;
    this.port.onmessage = () => { this.stopped = true; };
  }
  process(inputs, outputs) {
    if (this.stopped) return false;
    this.limiter.process(inputs[0] || [], outputs[0]);
    return true;
  }
}
registerProcessor("limiter", LimiterProcessor);
`
}
