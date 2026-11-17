# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T34 — Silent song previews in the sessions window (Opus · high · plan mode on), once you've saved a
backup from the live site ("Back up all sessions") and can say where it is. Up next is otherwise empty: pick from the
Backlog with `/ticket`.
Still to check on the live site: a Share link's preview card in Messages/Discord, an iPhone (Share…, silent switch),
Cloudflare Web Analytics; T33's install/offline (Chrome's install icon, airplane mode after one visit, iPhone Add to
Home Screen → welcome → import a backup from Files, and whether backup/WAV downloads work in the installed iPhone app).

## In progress

_None._

## Up next

### The redesign (T15–T22): where it's heading

Agreed with the owner on 2026-11-16 after a UX review. Fewer controls at the same level; progressions and
instruments become one idea (each progression comes with its own instruments and tempo, and you take the chords,
the instruments, or both); chord details always in the same place. Target layout (desktop):

```
🎹 create a chord progression (i)  [My song ▾]              [C minor · 120 BPM · 4/4 ▾] [⤓ MIDI]
[▶][■][⟲]  [↶][↷]  [+ Add chord]          [🎲 Random: Chords│Instruments│Both] [Browse progressions]
1            2            3            4                                       (track, full width)
[ Cm       ][ Eb       ][ Bb       ][ Fm       ]
── ▸ Voicing   All 4 chords   Inversion [↓ Lower][Higher ↑]  Octave [↓][↑]  [Smooth voicing] ──
── ▸ Instruments   [Pop ▾]    (open: Chords │ Bass │ Drums strips, swing) ───────────────────
── chord details: always here, fixed height, under Instruments ──────────────────────────────
▶ Cm  i  C Eb G   In key · Every note is in C minor…   ↺ Back to Fm     [Type a chord…] [⋯]
Ideas for this spot │ Variations of C │ Notes                           Before Eb, at the start.
```

The chord details stay under Instruments (owner, 2026-11-17: the "directly under the track" idea was dropped).
On screen it's "Instruments"; the code can keep calling it `groove`. Owner's decisions: the song button
shows its values (not an icon); MIDI keeps its own button; chord details never close (no X); all randomizing sits
in one group of three. Agent's calls the owner accepted: the right-click menu holds *actions* on chords, not the
ideas (menus close after one pick, and trying ideas one after another is the core loop); clicking an idea uses it
and plays it in place, so the card ▶ goes (reverses T2's decision). Every ticket keeps phones working (the `e2e`
widths), updates `AGENTS.md` (including the design decisions it reverses) and adds tests next to changed rules.
T16–T22 are done (the redesign is complete).

### Songs (T23–T25): where it's heading

Agreed with the owner on 2026-11-17. When writing a song you have a chorus and want to try verses and pre-choruses
against it, hear them in order and export it all. A session becomes a **song**: one or more **sections** (a
progression with a label: Intro, Verse, Pre-chorus, Chorus…), arranged on a **song timeline**. A session with one
unnamed section and nothing arranged is exactly today's app; existing users see one slim collapsed bar.

```
── ▸ Song   [Verse] [Pre-chorus] [Chorus●]  [+ Section ▾]                       [▶ Song] 2:08 ──
   (open)  1        5        9            17        21           29
           [ Intro ][ Verse        ][ Pre ][ Chorus     ][ Verse        ][ Chorus     ]   ← song timeline
1            2            3            4                                  (chord track: the Chorus)
[ Cm       ][ Eb       ][ Bb       ][ Fm       ]
── ▸ Voicing ── / ── ▸ Instruments (the Chorus's) ── / ── chord details ──
```

Owner's decisions:
- **Shared song-wide**: key, tempo, time signature (the "C minor · 120 BPM · 4/4" button is the song's).
  **Per section**: chords, length (bars), instruments.
- **Repeats are linked**: two Chorus blocks are the same Chorus (edit once, every Chorus changes). "Make a new
  section from this" forks an independent copy ("Chorus 2").
- **The song area is on top**, between the toolbar and the chord track, collapsed by default (song first, then
  chords, then one chord).
- **Three tickets**, not one shot. T23, T24 and T25 are all done.

Agent's calls the owner accepted (in the proposal):
- **Model** (`src/song.ts`, new, pure): `Section = { id, name: string | null, clips, bars, groove }`,
  `Block = { id, section }` (start/length derived, back to back), `Song = { tonic, mode, sig, bpm, sections,
  arrangement: Block[] }`, the undoable document. **`Track` stays** as "one section seen with the song's shared
  settings": lenses `sectionTrack(song, id): Track` and `withSectionTrack(song, id, track): Song` (shared fields
  → song, the rest → section; same object back when nothing changed, like `withMusic`) keep `App.tsx`,
  `progressionTrack`, `planDrop` etc. unchanged.
- **One undo history for the whole song.** Undoing an edit in another section switches the editor to it
  (`changedSection(a, b)`), so undo never changes something off screen.
- **Storage**: same `track` key, migrated on read (`readHistory` → `migrateSong`: a stored Track becomes a Song
  with one unnamed section, fixed id `main`, empty arrangement, across the whole history). The edited section
  is session UI state (new `section` key in `SESSION_KEYS`), not history.
- **The song timeline is not the chord `Timeline`**: chords live on a fixed length with gaps, resizing and a
  grid; the song is a variable-length list with none of those. Reuse `selection.ts` (generalized from `Clip` to
  `{ id, start }`), `ChordMenu`, `Panel`, the drag-label pattern, ruler/playhead CSS, the shortcut table.
- **One transport, never two things playing**: `playScope: 'section' | 'song'`. Transport Play plays the edited
  section (as today), **▶ Song** plays the arrangement; starting one stops the other. Space pauses whatever plays,
  and when stopped resumes the scope used last; Stop returns to that scope's start; Loop applies to either.
  The editor never jumps while the song plays: the chord track shows its playhead only while the edited section
  is the one sounding.

### T34 — Silent song previews in the sessions window (live site)
- **Status:** ready once the owner has saved a backup
- **Session:** Opus · high · plan mode on
- **Goal:** the owner's song sessions make sound when previewed (▶ in the sessions window) on chordsarefun.com
  (desktop). Reported in the T31 session; not reproduced there.
- **Before starting:** the owner saves "Back up all sessions" from the live site somewhere the agent can read and
  says where. Don't commit it (it's their work).
- **Done when:** the cause is found with the owner's data, fixed in `audio.ts` / `session.ts`, a unit test covers it,
  and a song preview from that backup is measured making sound in a production build.
- **Context:** what was ruled out (T31): a 2-part song (different presets, drums off in one part) previews with sound
  in dev and in `vite preview` (`chords-prod` in `.claude/launch.json`, port 4173; open the song there with a share
  link made in the dev page via `encodeShare`/`shareUrl`). How to measure: before clicking ▶, patch
  `AudioNode.prototype.connect` to record connections, then hang an `AnalyserNode` off the preview's
  `AudioWorkletNode` (the limiter) and sample peaks. Suspects not yet ruled out by data: `setPartLevels(g, seg.groove,
  time)` in `previewSession` schedules every block's ramps at once, and `node.mute = false` sets `.value`, which
  cancels ramps already scheduled (matters when a part is off in one block and on in another, in an order the test
  song didn't have); `sessionMusic` choosing segments whose sections have no chords; a part at volume 0.
  Song previews now play once (`passes: 1` in `SessionBrowser.tsx` `hear`).

## Backlog

- Shared links (T32): opening the same link twice makes two copies ("Name (shared)"). Could open an unedited
  copy that's already there instead (compare `toShared` of the present song). Owner's call; today's rule is simple.
- Sessions window: drag rows onto folders (today: the row's ⋯ → Move to). Maybe an undo toast instead of the
  delete confirm.
- Try T3's ⌘D on a full track: the copy shrinks to one grid step and the last chord is squeezed (the copy-drag
  rule). If that feels wrong in practice, alternatives: refuse, or split the duplicated chord in half. Owner's
  call.
- Phones: touch drags, resize handles and double-click-to-add are untested on a real device (T6 and T9 only
  fixed the layout, checked in desktop Chrome's phone emulation). Probably needs long-press or a visible "add"
  affordance instead of double-click.
- Octave-specific note edits in the notes lane (e.g. doubling the bass), open/spread voicings. (Touches the
  chord model: Opus, plan mode.)
- Sampled instruments (a real piano) if the synth presets aren't enough.
- Per-clip pattern overrides, drum fills, more drum kits, humanize (timing/velocity).
- Should a new empty spot open on Ideas even when the sticky tab is Notes? (Owner's call; today the tab is
  sticky everywhere. Agent's view: keep one rule; an empty spot's Notes tab still works, by clicking keys.)
- The production bundle is ~745 kB (Tone.js); Vite warns about chunks over 500 kB. Lazy-loading Tone on the
  first user gesture would halve the first load, if load time ever matters. Careful (T33): the service worker
  `skipWaiting`s and deletes old caches because nothing is lazily loaded; with lazy chunks, an old tab could ask
  for a chunk the new deploy removed. Keep old chunks or stop skipping the wait.

## Done

- T33 — Installable / offline app — 2026-11-17 — `display: standalone`; our own service worker written by the build (`serviceWorker.ts` + a `vite.config.ts` plugin, versioned by file contents; page network first with a 3 s fallback, files cache first, `ignoreVary`), registered in production (`pwa.ts`); an open tab gets "A new version is ready · Reload" (`UpdateNotice`); the installed app on fresh storage shows a welcome that imports a backup (`InstalledWelcome`, `isFreshStorage`, `readImport` shared with the sessions window); help footer says it works offline with an Install button / iPhone hint; `_headers` no-cache for `sw.js` and the page. e2e `offline.e2e.ts` on a real build (offline reload, deploys, welcome import). Owner's calls: standalone + welcome, notice + Reload, help-popover line. Not tried on a real iPhone.
- T31 — Keyboard access to chords and song blocks — 2026-11-17 — the chord track and the song lane are each one Tab stop (roving tabindex, listbox/option); Enter = click, ←/→ step from the focused chord/part with focus following, Shift+F10 / Menu key opens the menu; plain-words names (`clipSpokenName`, `blockSpokenName`: "Cm7, bar 1, in key", "Chorus, bars 5 to 8"); a polite live region announces drops (`doneLabel`) and keyboard edits; focus ring hugs chords/blocks; e2e for both lanes. Also (owner's ask): song previews in the sessions window play the whole song once (progressions loop) with a "Song · 2:08" tag; the reported silent song preview wasn't reproduced (T34). Not tried with a real screen reader.
- T32 — Share a song by link — 2026-11-17 — a Share button (song bar's right end, icon on phones; owner's call over an Export row) opens a panel: what's shared, the link, Copy link (falls back to selecting it), Share… where there's a share sheet; the link is `#song=` + the song as JSON without ids, deflate-raw, base64url (`share.ts`: ~400 chars for one progression, ~800 for 4 sections / 28 chords; with ids it was ~2,100). Opening one (on load or pasted into an open tab) adds a new session ("(shared)" if taken, "Shared song" for an automatic name), clears the hash, and shows a notice with ▶ Play; bad / too-new / unsupported / storage-full links say so. Versioned (`SHARE_VERSION`, `migrateSong`, a frozen v1 link in the tests); links are checked harder than stored songs (`isSafeSong`, 32k payload and 1 MB inflate caps). `importSessions(plan, open)`. e2e: share → open in a fresh browser → second copy → broken link; Share on the phone header row and on screen at ten widths. Owner to check on the live site: link preview card, an iPhone, Share….
- T30 — Production polish pass — 2026-11-17 — site basics for going public at chordsarefun.com: head tags (title, description, canonical, Open Graph/Twitter card with `og.png`, JSON-LD, noscript), icons + `site.webmanifest` (`display: browser`, iPhone storage), `robots.txt`, `sitemap.xml`, `_headers` (immutable `/assets/*`, nosniff, no CSP on purpose); save failures shown (`SaveStatus`, `SaveWarning`), `ErrorBoundary` crash screen (backup, blank session), `askToKeepStorage`; iPhone `audioSession` playback; global focus ring, reduced motion; all-rights-reserved `LICENSE`, `/licenses.txt` via Vite `build.license`, privacy + licenses footer in help; fixed the help popover running off screen at ~600–1100px. New: T31–T33. Unticketed: owner asked directly. Owner to check after deploy: share preview, iPhone silent switch, `curl -I` headers; Cloudflare Web Analytics is a dashboard step.
- T29 — Picked chip scrolls into view on phones — 2026-11-17 — genre chip (progression browser) and view chip (sessions window) scroll fully into view when picked or on open (`scrollIntoView` effects keyed on genre/view); e2e at 375px. Not looked at in the browser pane.
- T28 — A real master limiter — 2026-11-17 — lookahead brickwall in an AudioWorklet (`limiter.ts`: pure `createLimiter`, 5 ms lookahead, 50 ms release, −1 dBFS ceiling by construction; the worklet is built from its source text, `limiterWorkletSource`, since Tone's context can't load modules that import); playback, previews and WAV all go through it, the WAV skips its 5 ms delay (`Rendered.offset`); e2e checks the WAV peak. Measured on all 64 presets: peaks were +0.4…+6 dBFS, now exactly −1.00 with no sample over; loudness median −0.55 dB, Pop −0.7, worst Clav funk −2.2 / Country train −2.0 (busy presets sit ~−14 LUFS; presets left as they were, owner to judge). Deviation: no separate worklet file. Owner to listen: Pop, Clav funk, Country train for crunch or pumping on kicks, and whether anything sounds quieter or duller; a WAV vs playback.
- T26 — Export audio (WAV) — 2026-11-17 — ⤓ Export menu (Audio (WAV) | MIDI, whole song / this section, mix or stems; parts that are off disabled; files named after the session, `exportFileName`); `renderAudio` renders offline in 1 s slices driving Tone's clock (`bouncePlan` pure, 3 min in ~7–11 s; Tone.Offline was quadratic, ~75 s), with a floating progress bar and Cancel; `wav.ts` 24-bit encoder, tail trimmed never before the last bar; e2e downloads a WAV and cancels one. Deviations: not Tone.Offline (speed, progress, cancel); MIDI files renamed after the session too. Also fixed the details hint's missing space. Found: the mix clips on drum hits (T28). Owner to listen: WAV matches playback (levels, swing, section sound switches), stems sum to the mix, Ableton import.
- T25 — Song MIDI, sessions window, phones — 2026-11-17 — `songMidi` (renderSegments, a marker per block) with a Whole song | This section menu; sessions-window ▶ plays the whole song (`previewSession` takes segments: synth per sound, level ramps) and the row lists its parts; e2e checks an arranged song at ten widths. Owner to check: song MIDI in Ableton (one arrangement, locators); hearing a song session (sound switches between sections). Not looked at in the browser pane (e2e only).
- T24 — Song timeline and song playback — 2026-11-17 — Song panel (`SongPanel.tsx`, `songOpen`): chips + ▶ Song + length in its bar, the song timeline in its body (blocks back to back, linked repeats outlined, drag chips in / blocks around with labels, ⌘D, Delete, ←/→, ⌥←/→, right-click menu; `useBlockDrag`, arrangement edits in `song.ts`); one transport with `playScope` (section or song), the chord track hides its playhead while another section sounds; audio plays segments (`segments.ts`) with one synth per sound and level ramps at block starts. Deviations: one `schedule` instead of `scheduleSong`; a block's "Make a new section from this" makes that block unique; seeking the other scope's ruler while playing doesn't switch playback. Also: T27 dropped (owner: chord details stay under Instruments), help text's stale idea-▶ line fixed. Owner to listen: section sound switches, no stuck notes, seeking mid-song, editing while the song plays.
- T23 — Sections — 2026-11-17 — a session is a song (`src/song.ts`): sections with their own chords, length and instruments, sharing key/tempo/meter; old sessions open as one "Progression" section (`migrateSong`, fixed id `main`); one undo history that opens the section a step changes (`changedSection`); history saved packed, each section version once (owner's call; `history.ts` `encode`/`decode`); `SectionBar.tsx` chips (+ Section with labels and colors, rename, "Make a new section from this", delete); key detection/move and meter changes cover every section; progressions take the song's mood only when no other section has chords. Also: the toolbar now wraps up to 1000px (it overflowed at 900; e2e checks 900). Owner to listen: switching sections while playing.
- T22 — Chord details rework — 2026-11-16 — panel is always present (fixed height, no X, `panelOpen` retired; same frame shows an empty state); header gained "↺ Back to Cm" and ⋯ (opens `ChordMenu`; Clear lives there); tabs are Ideas · Variations of C · Notes; clicking an idea/variation uses it and plays it in place (card ▶ removed, why-text clamped to 2 lines); Notes tab has Bass note, Shape (inversion + octave), Why. Also fixed: the chord menu stayed open when you clicked a chord (clips stop pointerdown; the menu's outside-click listener is now capture-phase; e2e added). Owner to look at the panel on a phone and listen to click-to-hear.
- T21 — Chord menu — 2026-11-16 — `ChordMenu.tsx`: right-click (or long-press) a chord, or the ⋯ on a selected one, opens actions on the selection (Ideas, Variations, inversion, octave, Duplicate, Clear, Delete) with shortcuts; right-click selects an unselected chord first; Mac Ctrl+click still toggles selection. Rows built in `chordMenuGroups` (App.tsx), so T22 can reuse it. Owner to try a real right-click and the ⋯ on a phone.
- T20 — Voicing you can understand at a glance — 2026-11-16 — Inversion [↓ Lower][Higher ↑], Octave and Smooth voicing moved into the Voicing header (work while collapsed) after a scope label ("All 4 chords" / "F" / "2 selected chords"); clicking a chord in `NotesLane` selects it (`onSelect` → `selectClip`, so it also previews it); the header wraps below the title on narrow windows. Deviation: the panel hint moved into the expanded legend (no room in the bar); Smooth voicing keeps its old rule (selection only if 2+), so with one chord selected the label names that chord but Smooth acts on all (its tooltip says so). e2e: scope label, lane click + ↑. Owner to look at the header on a phone.
- T19 — Progression browser — 2026-11-16 — `ProgressionBrowser.tsx` (a modal like the sessions window; both now share `Modal.tsx`, `.modal-backdrop`): genres + search (`searchProgressions`), rows loop on click with the sounding chip lit, "Hear with: Its instruments | Your instruments" (global `progressionHearWith`), Use chords / Use instruments / Use both (`progressionTrack`, one undo step each; Enter and double-click = both); "Browse progressions" trigger replaces `ProgressionMenu.tsx`; Random gained Both. Calls the owner may revisit: search stays within the chosen genre ("Search all genres" when empty), ↑/↓ only keep playing if something was playing, under 400px the Random group shows the dice without the word. Owner to listen: a loop with Its vs Your instruments, flipping the switch mid-loop, Use both while the song plays.
- T18 — Every progression has its own instruments and tempo — 2026-11-16 — each of the 183 progressions has a hand-picked preset and BPM (in its preset's range, never Just chords or the waltz, ≥2 presets per genre; tests); `progressionMusic` → `SessionMusic`; `previewSession` gained `passes`; the Progressions menu's ▶ now plays one pass with its own instruments and tempo. Deviation: per-progression values instead of genre defaults + overrides (every one was picked anyway). Owner to listen via the menu ▶: Heartfelt pop, Future pop, Emo build, Phonk, Dubstep, Backdoor cadence, Giant cycle, Andalusian cadence, Flamenco, Tango drama, Calypso.
- T17 — Instruments section replaces the Groove dropdown — 2026-11-16 — `InstrumentsPanel` (under Voicing, closed by default, `instrumentsOpen`): preset `<select>` by genre in its bar (works collapsed, "Custom" when changed, never touches tempo), three strips + swing; `Panel` gained an `actions` slot; `GrooveMenu` and both dice gone, replaced by one `🎲 Random: Chords | Instruments` group (T19 adds Both); help text says Instruments. Deviation: Space doesn't play/pause inside the new native selects (it never did in the old ones either: the key handler skips selects, and Space opens them natively); sliders still do. Owner to look at the strips and the phone layout (Random gets its own row).
- T16 — Instruments and tempo join undo — 2026-11-16 — `Track` now holds `groove` and `bpm` (all undoable; sliders
  one step per drag via `Slider` gestures, no-op changes no step via `withMusic`/`sameGroove`); old sessions'
  history gets their saved `groove2`/`bpm` on open (`legacyMusic` → `migrateTrack`), `sessionMusic` reads the
  track; `readHistory` no longer passes map's index to `migrate`. Owner to listen: undo while playing.
- T15 — Song popover, one transport row, full-width track — 2026-11-16 — `SongMenu`: one "C minor · 127 BPM · 4/4" button (with the key-suggestion dot) opens Key (`KeyPanel`), tempo, time, length, grid, metronome; transport row now Play/Stop/Loop · Undo/Redo · "+ Add chord"; side buttons gone, track and lane full width; MIDI compact; phone header is two rows. Deviation: on phones the logo's title text is visually hidden so logo + session share row 1 (the full title can't fit beside the session at 320px); the transport wraps at 320px (Add chord on its own line). Owner to look at it on a real phone.
- T14 — Session rows list their chords — 2026-11-16 — every row shows its chords (the sounding one lights up while heard) with key · folder · edited on the right (under the chords on phones); "4 chords" is gone.
- T13 — Session preview loops — 2026-11-16 — the sessions window's ▶ loops the session (seamless, audio-clock scheduled pass by pass) until ■, closing the window or opening a session.
- T12 — Hear a session from the sessions window — 2026-11-16 — ▶ on each row plays that session once exactly as its own Play would (its tempo, groove, sounds, drums, mix; own sound graph, ■ stops), shows the chord names with the sounding one lit, pauses the song first.
- T11 — Detect key, silent session switch, sessions window, backups — 2026-11-16 — Key menu "Detect from your chords" (best match + major/minor second opinions, re-label only); `silenceAll` on session switch (progression/"in place" previews used to keep playing into the next session); the sessions dropdown became a modal window (folders, favorites, sort, search, inline rename/delete, no more "Unsaved session", blank sessions clean up); "Back up all sessions" / "Import backup…" (never overwrites, taken names get "(imported)"). Owner to listen once that switching sessions is silent.
- T10 — Key-change notice without moving the track — 2026-11-15 — `HomeNotice` is a fixed bottom-center bar (z-index 15), so the track never moves; clicking it keeps the selection; `e2e` case checks `.track` top before/after.
