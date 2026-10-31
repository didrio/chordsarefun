import { useMemo, useState } from 'react'
import { playProgression, previewChord, stopPlayback } from './music/audio'
import { downloadMidi } from './music/midi'
import { BEATS_PER_BAR, type ProgressionChord } from './music/progression'
import { diatonicChords, KEYS, MODES, type ChordSpec, type ModeName } from './music/theory'

export default function App() {
  const [tonic, setTonic] = useState<string>('C')
  const [mode, setMode] = useState<ModeName>('ionian')
  const [sevenths, setSevenths] = useState(false)
  const [bpm, setBpm] = useState(90)
  const [progression, setProgression] = useState<ProgressionChord[]>([])
  const [playingIndex, setPlayingIndex] = useState(-1)

  const palette = useMemo(() => diatonicChords(tonic, mode, sevenths), [tonic, mode, sevenths])
  const isPlaying = playingIndex >= 0

  const addChord = (chord: ChordSpec) => {
    previewChord(chord.symbol)
    setProgression((p) => [...p, { ...chord, id: crypto.randomUUID(), beats: BEATS_PER_BAR }])
  }

  const removeChord = (id: string) => setProgression((p) => p.filter((c) => c.id !== id))

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback()
      setPlayingIndex(-1)
    } else if (progression.length > 0) {
      playProgression(progression, bpm, setPlayingIndex)
    }
  }

  return (
    <main>
      <header>
        <h1>Chords</h1>
        <div className="controls">
          <label>
            Key
            <select value={tonic} onChange={(e) => setTonic(e.target.value)}>
              {KEYS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as ModeName)}>
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={sevenths} onChange={(e) => setSevenths(e.target.checked)} />
            7ths
          </label>
          <label>
            BPM
            <input
              type="number"
              min={30}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value) || 90)}
            />
          </label>
        </div>
      </header>

      <section>
        <h2>Palette</h2>
        <div className="palette">
          {palette.map((chord) => (
            <button key={chord.symbol} className="chord" onClick={() => addChord(chord)}>
              <span className="roman">{chord.roman}</span>
              <span className="symbol">{chord.symbol}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Progression</h2>
        {progression.length === 0 ? (
          <p className="empty">Click chords above to build a progression.</p>
        ) : (
          <ol className="progression">
            {progression.map((chord, i) => (
              <li key={chord.id} className={i === playingIndex ? 'chord active' : 'chord'}>
                <span className="roman">{chord.roman}</span>
                <span className="symbol">{chord.symbol}</span>
                <button className="remove" aria-label={`Remove ${chord.symbol}`} onClick={() => removeChord(chord.id)}>
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="actions">
          <button onClick={togglePlay} disabled={progression.length === 0}>
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          <button onClick={() => downloadMidi(progression, bpm)} disabled={progression.length === 0}>
            Download MIDI
          </button>
          <button onClick={() => setProgression([])} disabled={progression.length === 0}>
            Clear
          </button>
        </div>
      </section>
    </main>
  )
}
