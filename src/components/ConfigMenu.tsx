import type { ComponentProps } from 'react'
import { keyName } from '../music/theory'
import { sigLabel } from '../music/timeline'
import { HomeMenu } from './HomeMenu'
import { OptionsFields } from './OptionsMenu'
import { useDropdown } from './useDropdown'

type Props = ComponentProps<typeof OptionsFields> & ComponentProps<typeof HomeMenu>

/**
 * "Config:" in the toolbar: the song's settings in one tidy list, one setting per row
 * (Home, then tempo, time signature, length and grid). The button shows the current key,
 * tempo and time signature, so you can read them without opening it.
 */
export function ConfigMenu({ home, suggestion, onChange, ...options }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const summary = `${keyName(home.tonic, home.mode)} · ${options.bpm} BPM · ${sigLabel(options.sig)}`
  return (
    <div className="dropdown config-menu" ref={rootRef}>
      <span className="dropdown-label">Config:</span>
      <button
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Home (key and mood), tempo, time signature, length and grid"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="config-summary">{summary}</span>
        {suggestion && <span className="suggest-dot" aria-label="(suggestion available)" />}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel config-panel" role="dialog" aria-label="Config">
          <div className="config-group">
            <h3 className="config-heading">Song</h3>
            <HomeMenu home={home} suggestion={suggestion} onChange={onChange} />
          </div>
          <div className="config-group">
            <h3 className="config-heading">Timing</h3>
            <OptionsFields {...options} />
          </div>
        </div>
      )}
    </div>
  )
}
