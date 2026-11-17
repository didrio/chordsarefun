import type { ReactNode } from 'react'
import { applyGroove, describeGroove, GROOVES, matchingGroove, type GrooveSettings } from '../music/grooves'
import { BASS_PATTERNS, CHORD_PATTERNS, DRUM_PATTERNS, type PatternInfo } from '../music/patterns'
import { GENRES } from '../music/progressions'
import { BASS_SOUNDS, CHORD_SOUNDS, chordSound, type Instrument } from '../music/sound'
import { Panel } from './Panel'

type Props = {
  groove: GrooveSettings
  /** The section these instruments belong to, named when the song has several. */
  section?: string
  open: boolean
  onToggle: () => void
  /** A discrete change (toggle, picker, preset): one undo step. */
  onChange: (groove: GrooveSettings) => void
  /** A slider is grabbed (pointer down or a key press): what follows until it's let go is one undo step. */
  onSlideStart: () => void
  /** A slider moved (part of the step onSlideStart began). */
  onSlide: (groove: GrooveSettings) => void
}

const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id) ?? list[0]

/** A native select with the chosen option's description under it. */
function Picker({ label, value, options, onChange }: { label: string; value: string; options: (PatternInfo | Instrument)[]; onChange: (id: string) => void }) {
  return (
    <div className="picker">
      <label>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="menu-desc">{find(options, value).description}</p>
    </div>
  )
}

/**
 * A 0–1 slider whose drag is one undo step (like resizing a chord): grabbing it (pointer
 * down, or each key press) starts the step, every move updates it.
 */
function Slider({ value, step = 0.01, onStart, onSlide, ...rest }: { value: number; step?: number; onStart: () => void; onSlide: (v: number) => void; className?: string; title?: string; 'aria-label'?: string }) {
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={step}
      value={value}
      onPointerDown={onStart}
      onKeyDown={onStart}
      onChange={(e) => onSlide(Number(e.target.value))}
      {...rest}
    />
  )
}

/** One part (like a DAW track header): on/off, volume, then its pickers. */
function Part(props: { name: string; on: boolean; volume: number; onToggle: () => void; onSlideStart: () => void; onVolume: (v: number) => void; children: ReactNode }) {
  return (
    <div className={props.on ? 'part' : 'part off'}>
      <div className="part-head">
        <button className="toggle" aria-pressed={props.on} onClick={props.onToggle} title={`${props.name} on/off`}>
          {props.name}
        </button>
        <Slider
          className="volume"
          value={props.volume}
          onStart={props.onSlideStart}
          onSlide={props.onVolume}
          aria-label={`${props.name} volume`}
          title={`${props.name} volume`}
        />
      </div>
      <div className="part-pickers">{props.children}</div>
    </div>
  )
}

/** "Just chords" (plain held chords) isn't a genre's own, so it sits above the genre groups. */
const PLAIN = GROOVES.filter((g) => g.id === 'just')

/**
 * "Instruments": how the track is played, in a collapsible section under Voicing. Its bar
 * holds the preset picker, so presets work while it's collapsed; opened, it shows three
 * strips like DAW tracks (Chords, Bass, Drums) and swing. A preset sets every part's sound,
 * pattern, on/off, volume and swing, never the tempo; any part can then be changed alone.
 */
export function InstrumentsPanel({ groove, section, open, onToggle, onChange, onSlideStart, onSlide }: Props) {
  const preset = matchingGroove(groove)
  const { chords, bass, drums } = groove
  const set = <K extends 'chords' | 'bass' | 'drums'>(part: K, patch: Partial<GrooveSettings[K]>) =>
    onChange({ ...groove, [part]: { ...groove[part], ...patch } })
  const slide = <K extends 'chords' | 'bass' | 'drums'>(part: K, patch: Partial<GrooveSettings[K]>) =>
    onSlide({ ...groove, [part]: { ...groove[part], ...patch } })

  const presetPicker = (
    <select
      className="preset-select"
      aria-label="Instrument preset"
      title={preset ? describeGroove(preset) : 'You changed something, so this no longer matches a preset'}
      value={preset?.id ?? 'custom'}
      onChange={(e) => {
        const next = GROOVES.find((g) => g.id === e.target.value)
        if (next) onChange(applyGroove(groove, next))
      }}
    >
      {!preset && (
        <option value="custom" disabled>
          Custom
        </option>
      )}
      {PLAIN.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
      {GENRES.map((genre) => (
        <optgroup key={genre} label={genre}>
          {GROOVES.filter((g) => g.genre === genre && g.id !== 'just').map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )

  return (
    <Panel
      className="instruments-panel"
      title="Instruments"
      hint={section ? `for ${section}: chords, bass and drums` : 'sounds and patterns for chords, bass and drums'}
      open={open}
      onToggle={onToggle}
      actions={presetPicker}
    >
      <div className="mixer">
        <Part
          name="Chords"
          on={chords.on}
          volume={chords.volume}
          onToggle={() => set('chords', { on: !chords.on })}
          onSlideStart={onSlideStart}
          onVolume={(volume) => slide('chords', { volume })}
        >
          <Picker
            label="Sound"
            value={chords.sound}
            options={CHORD_SOUNDS}
            // Each sound has its own best brightness (a saw wants darker than a piano).
            onChange={(sound) => set('chords', { sound, brightness: chordSound(sound).brightness ?? chords.brightness })}
          />
          <Picker label="Pattern" value={chords.pattern} options={CHORD_PATTERNS} onChange={(pattern) => set('chords', { pattern })} />
          <label className="slider-row">
            Brightness
            <span className="muted">dark</span>
            <Slider value={chords.brightness} onStart={onSlideStart} onSlide={(brightness) => slide('chords', { brightness })} />
            <span className="muted">bright</span>
          </label>
        </Part>
        <Part name="Bass" on={bass.on} volume={bass.volume} onToggle={() => set('bass', { on: !bass.on })} onSlideStart={onSlideStart} onVolume={(volume) => slide('bass', { volume })}>
          <Picker label="Sound" value={bass.sound} options={BASS_SOUNDS} onChange={(sound) => set('bass', { sound })} />
          <Picker label="Pattern" value={bass.pattern} options={BASS_PATTERNS} onChange={(pattern) => set('bass', { pattern })} />
        </Part>
        <Part
          name="Drums"
          on={drums.on}
          volume={drums.volume}
          onToggle={() => set('drums', { on: !drums.on })}
          onSlideStart={onSlideStart}
          onVolume={(volume) => slide('drums', { volume })}
        >
          <Picker label="Pattern" value={drums.pattern} options={DRUM_PATTERNS} onChange={(pattern) => set('drums', { pattern })} />
        </Part>
      </div>
      <label className="slider-row swing-row">
        Swing
        <span className="muted">straight</span>
        <Slider
          step={0.05}
          value={groove.swing}
          onStart={onSlideStart}
          onSlide={(swing) => onSlide({ ...groove, swing })}
          title="Pushes the in-between 8th notes late, for a shuffled, swung feel"
        />
        <span className="muted">swung</span>
      </label>
    </Panel>
  )
}
