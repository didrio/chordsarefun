/** An audio export in progress (or one that failed), with a way out. */
export type ExportJob = { name: string; progress: number; failed?: boolean }

type Props = { job: ExportJob; onCancel: () => void }

/**
 * Floats at the bottom of the window while an audio export renders: the file's name, how far
 * along it is, and Cancel. Fixed in place (with the key notice), so it never moves the page.
 */
export function ExportStatus({ job, onCancel }: Props) {
  const percent = Math.floor(job.progress * 100)
  return (
    <div className="export-status" role="status">
      {job.failed ? (
        <span>
          Couldn't render <strong>{job.name}</strong>. This browser may not support rendering audio.
        </span>
      ) : (
        <>
          <span className="export-status-text">
            Rendering <strong>{job.name}</strong>… {percent}%
          </span>
          <span className="export-progress" aria-hidden>
            <span style={{ width: `${percent}%` }} />
          </span>
        </>
      )}
      <button className="small" onClick={onCancel}>
        {job.failed ? 'Got it' : 'Cancel'}
      </button>
    </div>
  )
}
