import { useEffect, useRef, useState } from 'react'
import { IS_MAC } from '../platform'
import { encodeShare, shareUrl } from '../share'
import type { Song } from '../song'
import { ShareIcon } from './Icons'
import { useDropdown } from './useDropdown'

type Props = {
  song: Song
  /** The session's name, which the link carries (the copy opened from it is named after it). */
  name: string
  /** Nothing to share yet (no chords anywhere). */
  disabled: boolean
}

/** Longer links get a note: Discord, for one, won't send a message over 2,000 characters. */
const LONG_LINK = 2_000

/**
 * Share: a link that holds the song itself (share.ts), so whoever opens it gets their own copy, with no
 * account and nothing uploaded. The panel says what's in it, shows the link, copies it, and offers the
 * device's share sheet where there is one (phones). The link is made when the panel opens (and again if
 * the song changes while it's open), so Copy writes it right inside the click, as Safari requires.
 */
export function ShareMenu({ song, name, disabled }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const [link, setLink] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  /** 'copied': "Copied ✓" for a moment. 'press': the clipboard said no, so the link is selected for ⌘C. */
  const [copied, setCopied] = useState<'copied' | 'press' | null>(null)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    encodeShare(song, name).then(
      (payload) => {
        if (cancelled) return
        setLink(shareUrl(location.origin + location.pathname, payload))
        setFailed(false)
      },
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [open, song, name])

  useEffect(() => {
    if (copied !== 'copied') return
    const id = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied('copied')
    } catch {
      // No clipboard here (blocked, or not https): select the link so ⌘C / Ctrl+C copies it.
      field.current?.select()
      setCopied('press')
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  // Closing the share sheet without sending rejects: nothing to say about that.
  const share = () => link && navigator.share({ title: name, url: link }).catch(() => {})

  return (
    <div className="dropdown share-menu" ref={rootRef}>
      <button
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        aria-label="Share this song"
        title={disabled ? 'Add chords, then share the song by link' : 'Share this song by link'}
        onClick={() => {
          setCopied(null)
          setOpen((o) => !o)
        }}
      >
        <ShareIcon />
        <span className="share-label">Share</span>
      </button>
      {open && (
        <div className="dropdown-panel share-panel" role="dialog" aria-label="Share this song">
          <p className="share-what">
            Anyone with the link opens their own copy: chords, sections, instruments, key and tempo. Changes you make
            later aren't in it.
          </p>
          {failed ? (
            <p className="share-what">
              <strong>This browser can't make share links.</strong> Update it, or try another browser.
            </p>
          ) : (
            <>
              <input
                ref={field}
                type="text"
                className="share-link"
                readOnly
                value={link ?? ''}
                placeholder="Making the link…"
                aria-label="Link to this song"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="share-actions">
                <button className="primary share-copy" onClick={() => void copy()} disabled={!link}>
                  {copied === 'copied' ? 'Copied ✓' : 'Copy link'}
                </button>
                {canShare && (
                  <button onClick={share} disabled={!link}>
                    Share…
                  </button>
                )}
                {copied === 'press' && <span className="muted">Press {IS_MAC ? '⌘C' : 'Ctrl+C'} to copy it</span>}
              </div>
              {link && link.length > LONG_LINK && (
                <p className="share-long">
                  Long link ({link.length.toLocaleString('en-US')} characters): some chat apps cut links this long.
                </p>
              )}
            </>
          )}
          <p className="menu-foot">Nothing is uploaded: the link holds the song itself.</p>
        </div>
      )}
    </div>
  )
}
