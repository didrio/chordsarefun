import { Note } from 'tonal'
import type { SessionMusic } from './audio'
import type { Track } from '../track'
import { chordName, makeChord, shiftOctave, type Chord } from './chord'
import { applyGroove, DEFAULT_GROOVE, GROOVES, type GrooveSettings } from './grooves'
import type { ModeName } from './theory'
import { FREE_RESOLUTION, sigBarTicks, type Clip, type TimeSignature } from './timeline'

/**
 * A library of well-known progressions by genre, written as roman numerals so they
 * work in any key. Numerals are relative to the tonic's major scale, the usual pop/rock
 * convention: ♭VII is a whole step below the tonic in any mode, i is a minor chord on
 * the tonic.
 */
export type Progression = {
  id: string
  name: string
  genre: Genre
  /** What it sounds like, in a few plain words (shown under its chords in the menu). */
  feel: string
  /** The scale it lives in; loading it switches the track to this scale. */
  mode: ModeName
  numerals: string[]
  /** How it's meant to sound: a groove preset id (GROOVES) and a tempo inside that preset's range. */
  groove: string
  bpm: number
}

/** Genres, most common first (the order of the menu). */
export const GENRES = [
  'Pop',
  'Rock',
  'Soul & R&B',
  'Electronic & Hip-hop',
  'Jazz',
  'Blues',
  'Folk & Country',
  'Cinematic',
  'Classical & World',
] as const

export type Genre = (typeof GENRES)[number]

const p = (
  genre: Genre,
  id: string,
  name: string,
  mode: ModeName,
  numerals: string,
  feel: string,
  groove: string,
  bpm: number,
): Progression => ({
  id,
  name,
  genre,
  feel,
  mode,
  numerals: numerals.split(' '),
  groove,
  bpm,
})

/**
 * Within each genre, most common first. The last two values are how each one is meant to
 * sound (preset, BPM): chosen per progression, so a genre spreads over several presets
 * (ballads on Piano ballad, power chords on Rock / Punk / Metal, jazz ballads on Jazz
 * ballad...). Never "Just chords" (that's for hearing the harmony bare) and never the 3/4
 * waltz (every progression is in 4/4).
 */
export const PROGRESSIONS: Progression[] = [
  p('Pop', 'pop', 'Pop anthem', 'ionian', 'I V vi IV', 'Uplifting and familiar: the backbone of countless hits', 'pop', 112),
  p('Pop', 'heartfelt', 'Heartfelt pop', 'ionian', 'vi IV I V', 'Same chords starting on the sad one: emotional but hopeful', 'ballad', 72),
  p('Pop', 'doowop', 'Doo-wop', 'ionian', 'I vi IV V', "Sweet '50s nostalgia", 'motown', 112),
  p('Pop', 'singalong', 'Singalong', 'ionian', 'I IV vi V', 'Bright and open', 'acoustic', 104),
  p('Pop', 'liftoff', 'Lift-off', 'ionian', 'IV I V vi', 'Starts away from home and keeps moving', 'indie', 118),
  p('Pop', 'rising', 'Rising chorus', 'ionian', 'IV V vi I', 'Climbs and lands home: a lift into the chorus', 'pop', 116),
  p('Pop', 'stadium', 'Stadium chant', 'ionian', 'I IV I V', 'Big, simple and singable', 'pop', 120),
  p('Pop', 'minorpop', 'Minor pop drive', 'ionian', 'vi V IV V', 'Restless and driving', 'synthpop', 118),
  p('Pop', 'ballad', 'Soft ballad', 'ionian', 'I iii vi IV', 'Tender and gentle', 'ballad', 68),
  p('Pop', 'sparkle', 'Sparkle pop', 'ionian', 'Iadd9 V vi IVadd9', 'The pop anthem with glittering 9ths', 'synthpop', 112),
  p('Pop', 'futurepop', 'Future pop', 'ionian', 'Imaj7 V vi7 IVmaj7', 'The pop anthem with lush 7ths', 'futurebass', 150),
  p('Pop', 'bigchorus', 'Big chorus', 'ionian', 'IV I vi V', 'Wide-open, arms-up chorus', 'pop', 122),
  p('Pop', 'bittersweetchorus', 'Bittersweet chorus', 'ionian', 'vi I IV V', 'Starts sad, ends hopeful', 'indie', 110),
  p('Pop', 'sunshine', 'Sunshine pop', 'ionian', 'I IV ii V', 'Bright and bouncy', 'citypop', 114),
  p('Pop', 'bittersweet', 'Bittersweet turn', 'ionian', 'I IV iv I', 'The borrowed minor iv adds a sigh', 'ballad', 74),
  p('Pop', 'melancholy', 'Melancholy loop', 'ionian', 'vi iii IV I', 'Wistful and gently sad', 'dreampop', 82),
  p('Pop', 'wistful', 'Wistful pop', 'ionian', 'I vi iii IV', 'Looking back, gently', 'indie', 104),
  p('Pop', 'tenderpop', 'Lullaby pop', 'ionian', 'I IV vi IV', 'Soft and rocking, like a lullaby', 'ballad', 66),
  p('Pop', 'pendulum', 'Pendulum', 'ionian', 'I V vi V', 'Swinging back and forth, gently hopeful', 'acoustic', 98),
  p('Pop', 'minorfour', 'Minor-four ballad', 'ionian', 'I iii IV iv', 'The borrowed iv makes it ache', 'ballad', 70),
  p('Pop', 'moodyverse', 'Moody verse', 'ionian', 'vi IV I iii', 'Holding something back', 'dreampop', 88),
  p('Pop', 'kpop', 'K-pop drive', 'ionian', 'vi V IV iii', 'Sleek, emotional and driving', 'synthpop', 122),
  p('Pop', 'royal', 'Royal road', 'ionian', 'IVmaj7 V7 iii7 vi7', 'Yearning; a staple of J-pop and anime', 'citypop', 108),
  p('Pop', 'jpopclimb', 'J-pop climb', 'ionian', 'IV V iii vi', 'Restless and yearning', 'pop', 124),
  p('Pop', 'darkpop', 'Dark pop', 'aeolian', 'i bIII bVII bVI', 'Moody and modern', 'synthpop', 108),
  p('Pop', 'minoranthem', 'Minor anthem', 'aeolian', 'i iv bVI bVII', 'Defiant and big', 'pop', 104),
  p('Pop', 'dramaticpop', 'Dramatic pop', 'aeolian', 'i bVI bVII bIII', 'Sweeping minor drama', 'ballad', 78),
  p('Pop', 'borrowedlift', 'Borrowed lift', 'ionian', 'I bVII IV V', 'A rock-flavored turn that lifts into V', 'indie', 122),
  p('Pop', 'longballad', 'Long ballad', 'ionian', 'I V vi IV iii IV ii V', 'An eight-bar ballad verse that builds', 'ballad', 72),
  p('Pop', 'floatingtwo', 'Floating two', 'ionian', 'ii7 Imaj7', 'Two soft chords, endlessly relaxed', 'dreampop', 80),
  p('Pop', 'shimmer', 'Shimmer', 'ionian', 'I Isus4 I Isus2', 'One chord that breathes and sparkles', 'indie', 108),
  p('Pop', 'ascending', 'Rising line', 'ionian', 'I I+ I6 I7', 'One chord with a line climbing inside it', 'ballad', 70),

  p('Rock', 'threechord', 'Three-chord rock', 'ionian', 'I IV V IV', 'Raw and simple', 'rock', 128),
  p('Rock', 'swagger', 'Mixolydian swagger', 'mixolydian', 'I bVII IV I', 'Anthemic classic-rock lift', 'southern', 104),
  p('Rock', 'anthem', 'Classic rock anthem', 'ionian', 'I V bVII IV', 'Fist-in-the-air; the borrowed bVII swaggers', 'rock', 120),
  p('Rock', 'minorriff', 'Minor rock riff', 'aeolian', 'i bVII bVI bVII', 'Brooding and heavy', 'grunge', 104),
  p('Rock', 'rise', 'Minor rise', 'aeolian', 'i bVI bVII i', 'Climbs back home: moody and determined', 'rock', 118),
  p('Rock', 'powerballad', 'Power ballad', 'aeolian', 'i bVI bVII bVII', 'Slow-building and dramatic', 'grunge', 90),
  p('Rock', 'arena', 'Arena descent', 'ionian', 'I bVII bVI bVII', 'Big borrowed chords stepping down', 'rock', 126),
  p('Rock', 'mixovamp', 'Mixolydian vamp', 'mixolydian', 'I bVII', 'Two chords, endless groove', 'southern', 100),
  p('Rock', 'britrock', 'Brit rock', 'ionian', 'I bIII bVII IV', 'Swaggering borrowed chords', 'rock', 130),
  p('Rock', 'grunge', 'Grunge', 'ionian', 'I bIII IV I', 'Heavy, moody major-minor clash', 'grunge', 108),
  p('Rock', 'garage', 'Garage riff', 'ionian', 'I5 bVII5 IV5 I5', 'Raw, bluesy power chords', 'rock', 136),
  p('Rock', 'power', 'Power chord riff', 'ionian', 'I5 bIII5 IV5 I5', 'Punk and metal riffs (no 3rds)', 'metal', 120),
  p('Rock', 'punk', 'Punk', 'ionian', 'I5 IV5 V5 IV5', 'Fast, loud power chords', 'punk', 184),
  p('Rock', 'emo', 'Emo build', 'ionian', 'IV V vi vi', 'Climbing into heartbreak', 'poppunk', 168),
  p('Rock', 'southern', 'Southern rock', 'mixolydian', 'I IV bVII IV', 'Loose, warm and swaggering', 'southern', 96),
  p('Rock', 'dorianrock', 'Dorian rock', 'dorian', 'i bIII IV i', 'Minor, but with a bright IV', 'rock', 116),
  p('Rock', 'desert', 'Desert rock', 'aeolian', 'i iv v iv', 'Dusty, hypnotic and heavy', 'grunge', 96),
  p('Rock', 'arenatwist', 'Arena twist', 'ionian', 'I V vi bVII', 'The anthem with a borrowed twist at the end', 'rock', 122),
  p('Rock', 'prog', 'Prog rock', 'ionian', 'I bVI bIII bVII', 'Big, strange, borrowed shifts', 'rock', 110),
  p('Rock', 'metal', 'Metal', 'aeolian', 'i5 bVI5 bVII5 i5', 'Dark power-chord riff', 'metal', 132),
  p('Rock', 'stoner', 'Stoner riff', 'aeolian', 'i5 bVII5 bVI5 v5', 'Slow, fuzzy and heavy', 'grunge', 92),
  p('Rock', 'phrygianmetal', 'Phrygian metal', 'phrygian', 'i5 bII5 i5 bVII5', 'Menacing half-step riff', 'metal', 138),

  p('Soul & R&B', 'dreamy', 'Dreamy two-step', 'ionian', 'Imaj7 IVmaj7', 'Floating back and forth: lo-fi, neo-soul', 'neosoul', 82),
  p('Soul & R&B', 'motown', 'Motown turnaround', 'ionian', 'I vi ii V', 'Classic soul bounce', 'motown', 116),
  p('Soul & R&B', 'dorian', 'Dorian groove', 'dorian', 'i7 IV7', 'Funky, hopeful minor vamp', 'funk', 104),
  p('Soul & R&B', 'slowjam', 'Slow jam', 'ionian', 'Imaj7 vi7 ii7 V7sus4', 'Late-night R&B', 'rnb', 72),
  p('Soul & R&B', 'neosoul', 'Neo-soul two-five', 'ionian', 'ii9 V9 Imaj9 vi9', 'Smooth and lush', 'neosoul', 86),
  p('Soul & R&B', 'soulfulminor', 'Soulful minor', 'aeolian', 'i7 iv7 bVII7 bIIImaj7', 'Melancholic but warm', 'rnb', 80),
  p('Soul & R&B', 'silky', 'Silky R&B', 'ionian', 'vi9 ii9 V9 Imaj9', 'Lush 9th chords falling home', 'rnb', 76),
  p('Soul & R&B', 'neosoulcycle', 'Neo-soul cycle', 'ionian', 'IVmaj7 III7 vi7 vi7', 'Smooth and yearning; the III7 pulls into vi', 'neosoul', 80),
  p('Soul & R&B', 'sunday', 'Sunday morning', 'ionian', 'IVmaj7 iii7 vi7 Imaj7', 'Easy, warm and unhurried', 'neosoul', 76),
  p('Soul & R&B', 'philly', 'Philly soul', 'ionian', 'Imaj7 IVmaj7 iii7 vi7', 'Lush, string-laden soul', 'disco', 116),
  p('Soul & R&B', 'softvamp', 'Soft vamp', 'ionian', 'Imaj9 vi9', 'Two lush chords, endlessly smooth', 'rnb', 74),
  p('Soul & R&B', 'latenight', 'Late night', 'ionian', 'vi7 V7sus4 IVmaj7 IVmaj7', 'Slow, smoky R&B', 'rnb', 70),
  p('Soul & R&B', 'soulballad', 'Soul ballad turn', 'ionian', 'Imaj7 iii7 IVmaj7 iv6', 'Warm, with a bittersweet minor iv', 'gospel', 70),
  p('Soul & R&B', 'neosouldescent', 'Neo-soul descent', 'ionian', 'IVmaj9 iii7 ii9 Imaj9', 'Lush chords stepping down home', 'neosoul', 84),
  p('Soul & R&B', 'climbingsoul', 'Climbing soul', 'ionian', 'ii7 iii7 IVmaj7 V7', 'Stepping up, building warmth', 'motown', 108),
  p('Soul & R&B', 'neosoulchain', 'Neo-soul chain', 'ionian', 'IVmaj7 III7 vi7 II7', 'Every chord pulls somewhere new', 'neosoul', 90),
  p('Soul & R&B', 'smoothminor', 'Smooth minor', 'aeolian', 'i7 bVImaj7 iv7 v7', 'Silky and melancholic', 'clavfunk', 98),
  p('Soul & R&B', 'minorrnb', 'Minor R&B', 'aeolian', 'i9 iv9 bVIImaj7 bIIImaj7', 'Moody and lush', 'rnb', 78),
  p('Soul & R&B', 'minorslowjam', 'Minor slow jam', 'aeolian', 'i7 iv7 v7 i7', 'Dark, smooth and slow', 'rnb', 72),
  p('Soul & R&B', 'gospel', 'Gospel lift', 'ionian', 'I I7 IV iv', 'Churchy and uplifting', 'gospel', 76),
  p('Soul & R&B', 'gospelturn', 'Gospel turnaround', 'ionian', 'I VI7 ii7 V7', 'The church-band way back home', 'gospelfast', 120),
  p('Soul & R&B', 'gospelpassing', 'Gospel passing chord', 'ionian', 'IV #iv°7 I vi', 'A diminished chord slides IV up to I', 'gospel', 72),
  p('Soul & R&B', 'walkup', 'Gospel walk-up', 'ionian', 'I #i°7 ii7 V7', 'A passing chord climbs into ii', 'gospelfast', 116),
  p('Soul & R&B', 'gospelclimb', 'Gospel climb', 'ionian', 'IV V iii vi ii V I I', 'The full church climb back home', 'gospel', 80),

  p('Electronic & Hip-hop', 'epic', 'Epic minor', 'aeolian', 'i bVI bIII bVII', 'Huge in EDM, film and rock', 'edm', 128),
  p('Electronic & Hip-hop', 'dark', 'Dark loop', 'aeolian', 'i bVI', 'Hypnotic: trap, drill, ambient', 'trap', 140),
  p('Electronic & Hip-hop', 'lofi', 'Lo-fi descent', 'ionian', 'IVmaj7 iii7 ii7 Imaj7', 'Chill and nostalgic', 'lofi', 78),
  p('Electronic & Hip-hop', 'jazzhop', 'Jazz-hop loop', 'ionian', 'ii7 V7 iii7 vi7', 'Boom-bap and study beats', 'boombap', 90),
  p('Electronic & Hip-hop', 'deephouse', 'Deep house vamp', 'aeolian', 'i9 iv9', 'Warm, hypnotic minor 9ths', 'deephouse', 122),
  p('Electronic & Hip-hop', 'deephousechords', 'Deep house chords', 'aeolian', 'i7 bVImaj7 bIIImaj7 bVII', 'Warm late-night house', 'house', 124),
  p('Electronic & Hip-hop', 'trance', 'Trance anthem', 'aeolian', 'i bIII bVII iv', 'Euphoric and driving', 'trance', 138),
  p('Electronic & Hip-hop', 'bigroom', 'Big room', 'aeolian', 'i bVI bVII v', 'Festival-sized minor drop', 'edm', 128),
  p('Electronic & Hip-hop', 'melodicbass', 'Melodic bass', 'ionian', 'vi IV V iii', 'Emotional festival drop', 'futurebass', 150),
  p('Electronic & Hip-hop', 'nightdrive', 'Night drive', 'aeolian', 'i bIII bVI bVII', 'Neon-lit and nostalgic', 'synthwave', 96),
  p('Electronic & Hip-hop', 'ukgarage', 'UK garage', 'ionian', 'ii7 V7 Imaj7 IVmaj7', 'Jazzy, bouncy two-step', 'garage', 132),
  p('Electronic & Hip-hop', 'soulsample', 'Soul sample loop', 'ionian', 'IVmaj7 iii7', 'Two warm chords, like a flipped soul record', 'boombap', 88),
  p('Electronic & Hip-hop', 'lofiminor', 'Lo-fi minor', 'aeolian', 'i9 bVImaj7 iv9 v9', 'Rainy-day minor 9ths', 'lofi', 74),
  p('Electronic & Hip-hop', 'malldream', 'Mall dream', 'ionian', 'IVmaj7 iii7 ii7 V7', 'Hazy, nostalgic vaporwave', 'vaporwave', 80),
  p('Electronic & Hip-hop', 'afrogroove', 'Afro groove', 'ionian', 'Imaj7 iii7 IVmaj7 V7', 'Sunny and rolling', 'afropop', 108),
  p('Electronic & Hip-hop', 'trap', 'Trap minor', 'aeolian', 'i iv bVI V', 'Sinister; the major V is borrowed', 'trap', 142),
  p('Electronic & Hip-hop', 'drill', 'Drill', 'aeolian', 'i iv bVI v', 'Cold, dark and sliding', 'drill', 142),
  p('Electronic & Hip-hop', 'phonk', 'Phonk', 'phrygian', 'i iv bII i', 'Dark, gritty and hypnotic', 'trap', 136),
  p('Electronic & Hip-hop', 'dubstep', 'Dubstep', 'aeolian', 'i bVI iv bVII', 'Heavy, half-time darkness', 'futurebass', 140),
  p('Electronic & Hip-hop', 'hyperpop', 'Hyperpop', 'ionian', 'IV V I vi', 'Bright, frantic and sugary', 'chiptune', 148),
  p('Electronic & Hip-hop', 'onechord', 'One-chord groove', 'dorian', 'i7', 'A single chord: all about rhythm and sound', 'acid', 124),

  p('Jazz', 'twofive', 'ii–V–I', 'ionian', 'ii7 V7 Imaj7 Imaj7', 'The core move of jazz', 'jazz', 140),
  p('Jazz', 'turnaround', 'Jazz turnaround', 'ionian', 'Imaj7 vi7 ii7 V7', 'Loops back home smoothly', 'jazz', 150),
  p('Jazz', 'minortwofive', 'Minor ii–V–i', 'aeolian', 'iiø7 V7 i7 i7', 'Moody and smooth', 'jazzballad', 66),
  p('Jazz', 'secondary', 'Secondary turnaround', 'ionian', 'Imaj7 VI7 ii7 V7', 'The VI7 pulls hard into ii', 'jazz', 156),
  p('Jazz', 'circle', 'Circle of fifths', 'ionian', 'iii7 vi7 ii7 V7', 'Each chord falls a fifth', 'jazz', 132),
  p('Jazz', 'tritone', 'Tritone sub', 'ionian', 'ii7 bII7 Imaj7 Imaj7', 'Slides down chromatically home', 'smoothjazz', 96),
  p('Jazz', 'backdoor', 'Backdoor cadence', 'ionian', 'iv7 bVII7 Imaj7 Imaj7', 'Sneaks home the back way', 'jazzballad', 62),
  p('Jazz', 'bossa', 'Bossa turn', 'ionian', 'Imaj7 II7 ii7 bII7', 'Breezy and Brazilian', 'bossa', 130),
  p('Jazz', 'cycle', 'Falling leaves cycle', 'ionian', 'ii7 V7 Imaj7 IVmaj7 viiø7 III7 vi7 vi7', 'The classic eight-bar circle into the relative minor', 'jazz', 124),
  p('Jazz', 'secondarychain', 'Secondary chain', 'ionian', 'iii7 VI7 ii7 V7', 'Every chord pulls into the next', 'lofijazz', 82),
  p('Jazz', 'minorjazzblues', 'Minor jazz turnaround', 'aeolian', 'i7 iv7 bVI7 V7', 'Dark and swinging', 'jazz', 144),
  p('Jazz', 'minorbossa', 'Minor bossa', 'aeolian', 'i7 iv7 iiø7 V7', 'Cool, sad and breezy', 'bossa', 126),
  p('Jazz', 'twofivevamp', 'Two-five vamp', 'ionian', 'ii7 V7', 'The jazz workhorse, looping', 'lofijazz', 84),
  p('Jazz', 'modalvamp', 'Modal vamp', 'dorian', 'i7 ii7', 'Floating Dorian minor, cool and open', 'jazz', 136),
  p('Jazz', 'rhythmbridge', 'Rhythm bridge', 'ionian', 'III7 VI7 II7 V7', 'A chain of dominants falling home', 'jazz', 164),
  p('Jazz', 'jazzballadturn', 'Ballad turnaround', 'ionian', 'Imaj7 #i°7 ii7 V7', 'Tender and classic', 'jazzballad', 60),
  p('Jazz', 'chromaticturn', 'Chromatic turnaround', 'ionian', 'Imaj7 bIII7 bVImaj7 bII7', 'A sliding, chromatic way home', 'smoothjazz', 100),
  p('Jazz', 'chromaticdescent', 'Chromatic descent', 'ionian', 'iii7 bIII7 ii7 bII7', 'Sliding down by half steps', 'lofijazz', 78),
  p('Jazz', 'minorlinecliche', 'Minor line cliché', 'aeolian', 'i imaj7 i7 i6', 'A falling line inside one minor chord: spy-movie cool', 'smoothjazz', 88),
  p('Jazz', 'giant', 'Giant cycle', 'ionian', 'Imaj7 bIII7 bVImaj7 VII7 IIImaj7 V7 Imaj7 Imaj7', 'Keys spinning in thirds, famously tricky', 'jazz', 170),

  p('Blues', 'shuffle', 'Blues shuffle', 'mixolydian', 'I7 IV7 I7 V7', 'The classic shuffle feel', 'blues', 104),
  p('Blues', 'eightbar', '8-bar blues', 'mixolydian', 'I7 V7 IV7 IV7 I7 V7 I7 V7', 'A full blues verse in 8 bars', 'slowblues', 66),
  p('Blues', 'boogie', 'Two-chord boogie', 'mixolydian', 'I7 IV7', 'Simple and greasy', 'blues', 112),
  p('Blues', 'quickchange', 'Quick-change blues', 'mixolydian', 'I7 IV7 I7 I7 IV7 IV7 I7 V7', 'Jumps to IV early, then home', 'blues', 96),
  p('Blues', 'jazzblues', 'Blues turnaround', 'mixolydian', 'I7 VI7 ii7 V7', 'The jazzy way back to the top', 'jazz', 124),
  p('Blues', 'minorblues', 'Minor blues', 'aeolian', 'i7 iv7 i7 V7', 'Dark and soulful', 'slowblues', 62),
  p('Blues', 'minor8bar', 'Minor 8-bar blues', 'aeolian', 'i7 i7 iv7 iv7 bVI7 V7 i7 V7', 'A dark blues verse in 8 bars', 'slowblues', 68),
  p('Blues', 'minorboogie', 'Minor boogie', 'aeolian', 'i7 iv7 i7 i7', 'Dark and grooving', 'blues', 92),
  p('Blues', 'bluesending', 'Blues ending', 'mixolydian', 'V7 IV7 I7 V7', 'The last four bars of a blues', 'blues', 108),
  p('Blues', 'gospelblues', 'Gospel blues', 'mixolydian', 'I7 IV7 #iv°7 I7', 'Churchy blues with a passing chord', 'gospel', 74),

  p('Folk & Country', 'threechords', 'Three-chord classic', 'ionian', 'I IV V I', 'Home, away, tension, home', 'country', 112),
  p('Folk & Country', 'campfire', 'Campfire', 'ionian', 'I V IV I', 'Easygoing', 'acoustic', 100),
  p('Folk & Country', 'country', 'Country lift', 'ionian', 'I II IV I', 'The major II adds a twang', 'countrytrain', 118),
  p('Folk & Country', 'strum', 'Folk strum', 'ionian', 'I Isus4 IV I', 'Open and ringing', 'acoustic', 96),
  p('Folk & Country', 'folkballad', 'Folk ballad', 'ionian', 'I iii IV I', 'Gentle and honest', 'indiefolk', 84),
  p('Folk & Country', 'countryballad', 'Country ballad', 'ionian', 'I iii IV V', 'Open-road and sincere', 'country', 100),
  p('Folk & Country', 'countrygospel', 'Country gospel', 'ionian', 'I I7 IV I', 'Front-porch and churchy', 'country', 104),
  p('Folk & Country', 'honkytonk', 'Honky-tonk', 'ionian', 'I I7 IV IV', 'Barroom swagger', 'countrytrain', 124),
  p('Folk & Country', 'gentleair', 'Gentle air', 'ionian', 'I ii IV I', 'Simple and pastoral', 'indiefolk', 92),
  p('Folk & Country', 'mixofolk', 'Mixolydian folk', 'mixolydian', 'I bVII I bVII', 'Bright and ancient-sounding', 'acoustic', 108),
  p('Folk & Country', 'modalfolk', 'Modal folk', 'dorian', 'i bVII i bVII', 'Ancient and Celtic', 'indiefolk', 96),
  p('Folk & Country', 'celtic', 'Celtic reel', 'dorian', 'i bVII bIII bVII', 'Lively and ancient', 'countrytrain', 126),
  p('Folk & Country', 'appalachian', 'Appalachian', 'dorian', 'i IV i bVII', 'Old-time mountain music', 'countrytrain', 120),
  p('Folk & Country', 'shanty', 'Sea shanty', 'aeolian', 'i bVII i V', 'Stomping minor singalong', 'country', 100),
  p('Folk & Country', 'oldballad', 'Old ballad', 'aeolian', 'i bIII bVII i', 'Like a song passed down for centuries', 'indiefolk', 82),
  p('Folk & Country', 'western', 'Western ballad', 'aeolian', 'i iv bVII i', 'A lonely desert road', 'acoustic', 90),

  p('Cinematic', 'heroic', 'Heroic', 'ionian', 'I bVI bVII I', 'Triumphant film-score lift', 'epic', 108),
  p('Cinematic', 'victory', 'Victory', 'ionian', 'bVI bVII I I', 'The triumphant arrival', 'epic', 100),
  p('Cinematic', 'quest', 'Quest', 'ionian', 'I IV bVII I', 'Adventurous and bright', 'epic', 116),
  p('Cinematic', 'wonder', 'Bittersweet wonder', 'ionian', 'I III IV iv', 'Magical, a little sad', 'musicbox', 84),
  p('Cinematic', 'uplift', 'Uplifting twist', 'ionian', 'I III vi IV', 'Hopeful with a surprising lift', 'cinematic', 78),
  p('Cinematic', 'storybook', 'Storybook', 'ionian', 'I III IV I', 'Once upon a time', 'musicbox', 90),
  p('Cinematic', 'lydian', 'Lydian wonder', 'lydian', 'I II I II', 'Floating sci-fi magic', 'ambient', 72),
  p('Cinematic', 'lydianfloat', 'Lydian float', 'lydian', 'Imaj7 II', 'Weightless and full of wonder', 'ambient', 66),
  p('Cinematic', 'awe', 'Awe', 'lydian', 'I II iii II', 'Wide-eyed and luminous', 'cinematic', 70),
  p('Cinematic', 'nostalgia', 'Nostalgia', 'ionian', 'IV iv I I', 'A sigh for the past', 'cinematic', 68),
  p('Cinematic', 'mediant', 'Chromatic mediant', 'ionian', 'I bVI I bVI', 'Mysterious, shifting, cinematic', 'cinematic', 74),
  p('Cinematic', 'somber', 'Somber march', 'aeolian', 'i iv v i', 'Grave and steady', 'epic', 90),
  p('Cinematic', 'suspense', 'Suspense', 'aeolian', 'i bVI i bVI', 'Something is about to happen', 'ambient', 76),
  p('Cinematic', 'darkcadence', 'Dark cadence', 'aeolian', 'iv V i i', 'Tension resolving into darkness', 'cinematic', 64),
  p('Cinematic', 'risingsorrow', 'Rising sorrow', 'aeolian', 'bVI bVII i i', 'Grief turning into resolve', 'epic', 94),
  p('Cinematic', 'mystery', 'Mystery', 'aeolian', 'i v bVI iv', 'Unanswered questions', 'ambient', 84),
  p('Cinematic', 'villain', 'Villain', 'aeolian', 'i iv bII V', 'Sinister and grand', 'epic', 104),
  p('Cinematic', 'menace', 'Phrygian menace', 'phrygian', 'i bII', 'Dark and threatening', 'cinematic', 70),
  p('Cinematic', 'dread', 'Dread', 'aeolian', 'i bII i bII', 'Creeping, half-step horror', 'ambient', 64),

  p('Classical & World', 'canon', 'Canon', 'ionian', 'I V vi iii IV I IV V', 'Stately and warm: the classic descending pattern', 'classical', 76),
  p('Classical & World', 'andalusian', 'Andalusian cadence', 'aeolian', 'i bVII bVI V', 'Descending and fiery: flamenco drama', 'acoustic', 104),
  p('Classical & World', 'fifths', 'Falling fifths', 'ionian', 'vi ii V I', 'Each chord falls a fifth into home', 'classical', 92),
  p('Classical & World', 'amen', 'Amen cadence', 'ionian', 'IV I', "A gentle 'amen'", 'organ', 66),
  p('Classical & World', 'hymn', 'Hymn', 'ionian', 'I IV I V I IV V I', 'Plain, warm and churchlike', 'organ', 72),
  p('Classical & World', 'picardy', 'Minor to major', 'aeolian', 'i iv V I', 'Dark, ending in light', 'classical', 84),
  p('Classical & World', 'tango', 'Tango drama', 'aeolian', 'i iv V i', 'Passionate and theatrical', 'classical', 104),
  p('Classical & World', 'neapolitan', 'Neapolitan cadence', 'aeolian', 'i bII V i', 'Dramatic classical minor ending', 'classical', 88),
  p('Classical & World', 'baroque', 'Baroque sequence', 'ionian', 'I IV vii° iii vi ii V I', 'The full circle of the key, Bach-style', 'baroque', 96),
  p('Classical & World', 'folia', 'La Folia', 'aeolian', 'i V i bVII bIII bVII i V', 'A centuries-old dramatic dance', 'baroque', 100),
  p('Classical & World', 'romanesca', 'Romanesca', 'aeolian', 'bIII bVII i V', 'Renaissance grace', 'baroque', 88),
  p('Classical & World', 'lament', 'Lament', 'aeolian', 'i v iv V', 'Mournful and noble', 'organ', 62),
  p('Classical & World', 'minorcircle', 'Minor circle', 'aeolian', 'i iv bVII bIII bVI ii° V i', 'The full minor circle, Baroque-style', 'baroque', 92),
  p('Classical & World', 'island', 'Island two-step', 'ionian', 'I IV', 'Easygoing reggae and calypso sway', 'reggae', 76),
  p('Classical & World', 'calypso', 'Calypso', 'ionian', 'I V I V', 'A breezy island bounce', 'dancehall', 106),
  p('Classical & World', 'highlife', 'Highlife', 'ionian', 'I V IV V', 'Sunny West African guitar sway', 'afropop', 112),
  p('Classical & World', 'highlandlament', 'Highland lament', 'aeolian', 'i v bVI bVII', 'Misty and proud', 'cinematic', 72),
  p('Classical & World', 'flamenco', 'Flamenco', 'phrygian', 'i bII bIII bII', 'Fiery Spanish color', 'acoustic', 112),
  p('Classical & World', 'phrygiandescent', 'Phrygian descent', 'phrygian', 'i bVII bVI bII', 'Spanish fire stepping down', 'acoustic', 100),
]

const MAJOR_STEPS = ['1P', '2M', '3M', '4P', '5P', '6M', '7M']
const NUMERAL_RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/
const DEGREES = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']

/** Suffix after an uppercase numeral -> chord type. */
const UPPER: Record<string, string> = {
  '': '',
  '5': '5',
  '7': '7',
  maj7: 'maj7',
  '9': '9',
  maj9: 'maj9',
  add9: 'add9',
  '6': '6',
  sus4: 'sus4',
  sus2: 'sus2',
  '7sus4': '7sus4',
  '+': 'aug',
}
/** Suffix after a lowercase numeral -> chord type (minor-based). */
const LOWER: Record<string, string> = { '': 'm', '5': '5', maj7: 'mMaj7', '7': 'm7', '9': 'm9', add9: 'madd9', '6': 'm6', '°': 'dim', '°7': 'dim7', ø7: 'm7b5' }

/** A numeral as a chord in `tonic`, e.g. ("bVII", "C") → B♭. Null if unreadable. */
export function numeralChord(numeral: string, tonic: string): Chord | null {
  const m = NUMERAL_RE.exec(numeral)
  if (!m) return null
  const [, acc, rn, suffix] = m
  const lower = rn === rn.toLowerCase()
  const type = (lower ? LOWER : UPPER)[suffix]
  if (type === undefined) return null
  let root = Note.transpose(tonic, MAJOR_STEPS[DEGREES.indexOf(rn.toLowerCase())])
  if (acc === 'b') root = Note.transpose(root, '-1A')
  if (acc === '#') root = Note.transpose(root, '1A')
  root = Note.pitchClass(root)
  return makeChord(/##|bb/.test(root) ? Note.simplify(root) : root, type)
}

/**
 * The progression's chords in `tonic`, an octave above the default voicing (around
 * C4, where chords usually sit in a mix; root position otherwise).
 */
export const progressionChords = (prog: Progression, tonic: string): Chord[] =>
  prog.numerals
    .map((n) => numeralChord(n, tonic))
    .filter((c): c is Chord => c !== null)
    .map((c) => shiftOctave(c, 1) ?? c)

/**
 * The progression laid out on a track: one chord per bar, repeated while it fits
 * (4 chords on 8 bars play twice). If the track is shorter than the progression, the
 * chords share it evenly instead.
 */
export function progressionClips(prog: Progression, tonic: string, total: number, barTicks: number): Clip[] {
  const chords = progressionChords(prog, tonic)
  const n = chords.length
  if (n === 0) return []
  const span = n * barTicks
  if (span <= total) {
    const reps = Math.floor(total / span)
    return Array.from({ length: reps * n }, (_, i) => ({
      id: crypto.randomUUID(),
      chord: chords[i % n],
      start: i * barTicks,
      length: barTicks,
    }))
  }
  const at = (i: number) => Math.round((i * total) / n / FREE_RESOLUTION) * FREE_RESOLUTION
  return chords.map((chord, i) => ({ id: crypto.randomUUID(), chord, start: at(i), length: at(i + 1) - at(i) }))
}

/** Every progression is heard in 4/4, one chord per bar. */
export const PROGRESSION_SIG: TimeSignature = { beats: 4, unit: 4 }

/**
 * A progression ready to hear with previewSession: its chords in `tonic`, one bar each in
 * 4/4, played with its own preset and tempo, or with the `groove` and `bpm` passed in
 * ("your instruments": the open session's).
 */
export function progressionMusic(prog: Progression, tonic: string, groove?: GrooveSettings, bpm?: number): SessionMusic {
  const bar = sigBarTicks(PROGRESSION_SIG)
  const totalTicks = prog.numerals.length * bar
  const preset = GROOVES.find((g) => g.id === prog.groove)
  return {
    clips: progressionClips(prog, tonic, totalTicks, bar),
    totalTicks,
    sig: PROGRESSION_SIG,
    bpm: bpm ?? prog.bpm,
    groove: groove ?? (preset ? applyGroove(DEFAULT_GROOVE, preset) : DEFAULT_GROOVE),
  }
}

/** What to take from a progression: its chords (and scale), its instruments (and tempo), or both. */
export type ProgressionParts = { chords: boolean; instruments: boolean }

/** A progression's preset, if its id is known. */
export const progressionPreset = (prog: Progression) => GROOVES.find((g) => g.id === prog.groove) ?? null

/**
 * The track with a progression's chords and/or instruments taken (one undo step for any of
 * "Use chords", "Use instruments", "Use both"). Chords: its chords laid out on the track's own
 * length and meter, in its scale (so they read as in key). Instruments: its preset and its tempo.
 * The key's tonic, the length and the time signature are always yours.
 */
export function progressionTrack(t: Track, prog: Progression, parts: ProgressionParts): Track {
  let next = t
  if (parts.chords) {
    const bar = sigBarTicks(t.sig)
    next = { ...next, mode: prog.mode, clips: progressionClips(prog, t.tonic, t.bars * bar, bar) }
  }
  const preset = progressionPreset(prog)
  if (parts.instruments && preset) next = { ...next, groove: applyGroove(t.groove, preset), bpm: prog.bpm }
  return next
}

/** Typed ♭/♯ read as b/#, the way numerals are written. */
const normalize = (s: string) => s.toLowerCase().replace(/♭/g, 'b').replace(/♯/g, '#')

/**
 * The progression browser's list: one genre (or all), then every word of the query must
 * appear in the name, the feel, the chords (in `tonic`), the numerals or the preset's name.
 * Library order (most common first) is kept.
 */
export function searchProgressions(list: Progression[], genre: Genre | 'all', query: string, tonic: string): Progression[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return list.filter((prog) => {
    if (genre !== 'all' && prog.genre !== genre) return false
    if (words.length === 0) return true
    const text = normalize(
      [prog.name, prog.feel, ...progressionChords(prog, tonic).map(chordName), ...prog.numerals, progressionPreset(prog)?.name ?? ''].join(' '),
    )
    return words.every((w) => text.includes(w))
  })
}
