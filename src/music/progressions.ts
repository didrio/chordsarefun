import { Note } from 'tonal'
import { makeChord, shiftOctave, type Chord } from './chord'
import type { ModeName } from './theory'
import { FREE_RESOLUTION, type Clip } from './timeline'

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
  /** What it sounds like, in a few plain words (shown on hover). */
  feel: string
  /** The scale it lives in; loading it switches the track to this scale. */
  mode: ModeName
  numerals: string[]
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

const p = (genre: Genre, id: string, name: string, mode: ModeName, numerals: string, feel: string): Progression => ({
  id,
  name,
  genre,
  feel,
  mode,
  numerals: numerals.split(' '),
})

/** Within each genre, most common first. */
export const PROGRESSIONS: Progression[] = [
  p('Pop', 'pop', 'Pop anthem', 'ionian', 'I V vi IV', 'Uplifting and familiar: the backbone of countless hits'),
  p('Pop', 'heartfelt', 'Heartfelt pop', 'ionian', 'vi IV I V', 'Same chords starting on the sad one: emotional but hopeful'),
  p('Pop', 'doowop', 'Doo-wop', 'ionian', 'I vi IV V', "Sweet '50s nostalgia"),
  p('Pop', 'singalong', 'Singalong', 'ionian', 'I IV vi V', 'Bright and open'),
  p('Pop', 'liftoff', 'Lift-off', 'ionian', 'IV I V vi', 'Starts away from home and keeps moving'),
  p('Pop', 'rising', 'Rising chorus', 'ionian', 'IV V vi I', 'Climbs and lands home: a lift into the chorus'),
  p('Pop', 'stadium', 'Stadium chant', 'ionian', 'I IV I V', 'Big, simple and singable'),
  p('Pop', 'minorpop', 'Minor pop drive', 'ionian', 'vi V IV V', 'Restless and driving'),
  p('Pop', 'ballad', 'Soft ballad', 'ionian', 'I iii vi IV', 'Tender and gentle'),
  p('Pop', 'sparkle', 'Sparkle pop', 'ionian', 'Iadd9 V vi IVadd9', 'The pop anthem with glittering 9ths'),
  p('Pop', 'futurepop', 'Future pop', 'ionian', 'Imaj7 V vi7 IVmaj7', 'The pop anthem with lush 7ths'),
  p('Pop', 'bigchorus', 'Big chorus', 'ionian', 'IV I vi V', 'Wide-open, arms-up chorus'),
  p('Pop', 'bittersweetchorus', 'Bittersweet chorus', 'ionian', 'vi I IV V', 'Starts sad, ends hopeful'),
  p('Pop', 'sunshine', 'Sunshine pop', 'ionian', 'I IV ii V', 'Bright and bouncy'),
  p('Pop', 'bittersweet', 'Bittersweet turn', 'ionian', 'I IV iv I', 'The borrowed minor iv adds a sigh'),
  p('Pop', 'melancholy', 'Melancholy loop', 'ionian', 'vi iii IV I', 'Wistful and gently sad'),
  p('Pop', 'wistful', 'Wistful pop', 'ionian', 'I vi iii IV', 'Looking back, gently'),
  p('Pop', 'tenderpop', 'Lullaby pop', 'ionian', 'I IV vi IV', 'Soft and rocking, like a lullaby'),
  p('Pop', 'pendulum', 'Pendulum', 'ionian', 'I V vi V', 'Swinging back and forth, gently hopeful'),
  p('Pop', 'minorfour', 'Minor-four ballad', 'ionian', 'I iii IV iv', 'The borrowed iv makes it ache'),
  p('Pop', 'moodyverse', 'Moody verse', 'ionian', 'vi IV I iii', 'Holding something back'),
  p('Pop', 'kpop', 'K-pop drive', 'ionian', 'vi V IV iii', 'Sleek, emotional and driving'),
  p('Pop', 'royal', 'Royal road', 'ionian', 'IVmaj7 V7 iii7 vi7', 'Yearning; a staple of J-pop and anime'),
  p('Pop', 'jpopclimb', 'J-pop climb', 'ionian', 'IV V iii vi', 'Restless and yearning'),
  p('Pop', 'darkpop', 'Dark pop', 'aeolian', 'i bIII bVII bVI', 'Moody and modern'),
  p('Pop', 'minoranthem', 'Minor anthem', 'aeolian', 'i iv bVI bVII', 'Defiant and big'),
  p('Pop', 'dramaticpop', 'Dramatic pop', 'aeolian', 'i bVI bVII bIII', 'Sweeping minor drama'),
  p('Pop', 'borrowedlift', 'Borrowed lift', 'ionian', 'I bVII IV V', 'A rock-flavored turn that lifts into V'),
  p('Pop', 'longballad', 'Long ballad', 'ionian', 'I V vi IV iii IV ii V', 'An eight-bar ballad verse that builds'),
  p('Pop', 'floatingtwo', 'Floating two', 'ionian', 'ii7 Imaj7', 'Two soft chords, endlessly relaxed'),
  p('Pop', 'shimmer', 'Shimmer', 'ionian', 'I Isus4 I Isus2', 'One chord that breathes and sparkles'),
  p('Pop', 'ascending', 'Rising line', 'ionian', 'I I+ I6 I7', 'One chord with a line climbing inside it'),

  p('Rock', 'threechord', 'Three-chord rock', 'ionian', 'I IV V IV', 'Raw and simple'),
  p('Rock', 'swagger', 'Mixolydian swagger', 'mixolydian', 'I bVII IV I', 'Anthemic classic-rock lift'),
  p('Rock', 'anthem', 'Classic rock anthem', 'ionian', 'I V bVII IV', 'Fist-in-the-air; the borrowed bVII swaggers'),
  p('Rock', 'minorriff', 'Minor rock riff', 'aeolian', 'i bVII bVI bVII', 'Brooding and heavy'),
  p('Rock', 'rise', 'Minor rise', 'aeolian', 'i bVI bVII i', 'Climbs back home: moody and determined'),
  p('Rock', 'powerballad', 'Power ballad', 'aeolian', 'i bVI bVII bVII', 'Slow-building and dramatic'),
  p('Rock', 'arena', 'Arena descent', 'ionian', 'I bVII bVI bVII', 'Big borrowed chords stepping down'),
  p('Rock', 'mixovamp', 'Mixolydian vamp', 'mixolydian', 'I bVII', 'Two chords, endless groove'),
  p('Rock', 'britrock', 'Brit rock', 'ionian', 'I bIII bVII IV', 'Swaggering borrowed chords'),
  p('Rock', 'grunge', 'Grunge', 'ionian', 'I bIII IV I', 'Heavy, moody major-minor clash'),
  p('Rock', 'garage', 'Garage riff', 'ionian', 'I5 bVII5 IV5 I5', 'Raw, bluesy power chords'),
  p('Rock', 'power', 'Power chord riff', 'ionian', 'I5 bIII5 IV5 I5', 'Punk and metal riffs (no 3rds)'),
  p('Rock', 'punk', 'Punk', 'ionian', 'I5 IV5 V5 IV5', 'Fast, loud power chords'),
  p('Rock', 'emo', 'Emo build', 'ionian', 'IV V vi vi', 'Climbing into heartbreak'),
  p('Rock', 'southern', 'Southern rock', 'mixolydian', 'I IV bVII IV', 'Loose, warm and swaggering'),
  p('Rock', 'dorianrock', 'Dorian rock', 'dorian', 'i bIII IV i', 'Minor, but with a bright IV'),
  p('Rock', 'desert', 'Desert rock', 'aeolian', 'i iv v iv', 'Dusty, hypnotic and heavy'),
  p('Rock', 'arenatwist', 'Arena twist', 'ionian', 'I V vi bVII', 'The anthem with a borrowed twist at the end'),
  p('Rock', 'prog', 'Prog rock', 'ionian', 'I bVI bIII bVII', 'Big, strange, borrowed shifts'),
  p('Rock', 'metal', 'Metal', 'aeolian', 'i5 bVI5 bVII5 i5', 'Dark power-chord riff'),
  p('Rock', 'stoner', 'Stoner riff', 'aeolian', 'i5 bVII5 bVI5 v5', 'Slow, fuzzy and heavy'),
  p('Rock', 'phrygianmetal', 'Phrygian metal', 'phrygian', 'i5 bII5 i5 bVII5', 'Menacing half-step riff'),

  p('Soul & R&B', 'dreamy', 'Dreamy two-step', 'ionian', 'Imaj7 IVmaj7', 'Floating back and forth: lo-fi, neo-soul'),
  p('Soul & R&B', 'motown', 'Motown turnaround', 'ionian', 'I vi ii V', 'Classic soul bounce'),
  p('Soul & R&B', 'dorian', 'Dorian groove', 'dorian', 'i7 IV7', 'Funky, hopeful minor vamp'),
  p('Soul & R&B', 'slowjam', 'Slow jam', 'ionian', 'Imaj7 vi7 ii7 V7sus4', 'Late-night R&B'),
  p('Soul & R&B', 'neosoul', 'Neo-soul two-five', 'ionian', 'ii9 V9 Imaj9 vi9', 'Smooth and lush'),
  p('Soul & R&B', 'soulfulminor', 'Soulful minor', 'aeolian', 'i7 iv7 bVII7 bIIImaj7', 'Melancholic but warm'),
  p('Soul & R&B', 'silky', 'Silky R&B', 'ionian', 'vi9 ii9 V9 Imaj9', 'Lush 9th chords falling home'),
  p('Soul & R&B', 'neosoulcycle', 'Neo-soul cycle', 'ionian', 'IVmaj7 III7 vi7 vi7', 'Smooth and yearning; the III7 pulls into vi'),
  p('Soul & R&B', 'sunday', 'Sunday morning', 'ionian', 'IVmaj7 iii7 vi7 Imaj7', 'Easy, warm and unhurried'),
  p('Soul & R&B', 'philly', 'Philly soul', 'ionian', 'Imaj7 IVmaj7 iii7 vi7', 'Lush, string-laden soul'),
  p('Soul & R&B', 'softvamp', 'Soft vamp', 'ionian', 'Imaj9 vi9', 'Two lush chords, endlessly smooth'),
  p('Soul & R&B', 'latenight', 'Late night', 'ionian', 'vi7 V7sus4 IVmaj7 IVmaj7', 'Slow, smoky R&B'),
  p('Soul & R&B', 'soulballad', 'Soul ballad turn', 'ionian', 'Imaj7 iii7 IVmaj7 iv6', 'Warm, with a bittersweet minor iv'),
  p('Soul & R&B', 'neosouldescent', 'Neo-soul descent', 'ionian', 'IVmaj9 iii7 ii9 Imaj9', 'Lush chords stepping down home'),
  p('Soul & R&B', 'climbingsoul', 'Climbing soul', 'ionian', 'ii7 iii7 IVmaj7 V7', 'Stepping up, building warmth'),
  p('Soul & R&B', 'neosoulchain', 'Neo-soul chain', 'ionian', 'IVmaj7 III7 vi7 II7', 'Every chord pulls somewhere new'),
  p('Soul & R&B', 'smoothminor', 'Smooth minor', 'aeolian', 'i7 bVImaj7 iv7 v7', 'Silky and melancholic'),
  p('Soul & R&B', 'minorrnb', 'Minor R&B', 'aeolian', 'i9 iv9 bVIImaj7 bIIImaj7', 'Moody and lush'),
  p('Soul & R&B', 'minorslowjam', 'Minor slow jam', 'aeolian', 'i7 iv7 v7 i7', 'Dark, smooth and slow'),
  p('Soul & R&B', 'gospel', 'Gospel lift', 'ionian', 'I I7 IV iv', 'Churchy and uplifting'),
  p('Soul & R&B', 'gospelturn', 'Gospel turnaround', 'ionian', 'I VI7 ii7 V7', 'The church-band way back home'),
  p('Soul & R&B', 'gospelpassing', 'Gospel passing chord', 'ionian', 'IV #iv°7 I vi', 'A diminished chord slides IV up to I'),
  p('Soul & R&B', 'walkup', 'Gospel walk-up', 'ionian', 'I #i°7 ii7 V7', 'A passing chord climbs into ii'),
  p('Soul & R&B', 'gospelclimb', 'Gospel climb', 'ionian', 'IV V iii vi ii V I I', 'The full church climb back home'),

  p('Electronic & Hip-hop', 'epic', 'Epic minor', 'aeolian', 'i bVI bIII bVII', 'Huge in EDM, film and rock'),
  p('Electronic & Hip-hop', 'dark', 'Dark loop', 'aeolian', 'i bVI', 'Hypnotic: trap, drill, ambient'),
  p('Electronic & Hip-hop', 'lofi', 'Lo-fi descent', 'ionian', 'IVmaj7 iii7 ii7 Imaj7', 'Chill and nostalgic'),
  p('Electronic & Hip-hop', 'jazzhop', 'Jazz-hop loop', 'ionian', 'ii7 V7 iii7 vi7', 'Boom-bap and study beats'),
  p('Electronic & Hip-hop', 'deephouse', 'Deep house vamp', 'aeolian', 'i9 iv9', 'Warm, hypnotic minor 9ths'),
  p('Electronic & Hip-hop', 'deephousechords', 'Deep house chords', 'aeolian', 'i7 bVImaj7 bIIImaj7 bVII', 'Warm late-night house'),
  p('Electronic & Hip-hop', 'trance', 'Trance anthem', 'aeolian', 'i bIII bVII iv', 'Euphoric and driving'),
  p('Electronic & Hip-hop', 'bigroom', 'Big room', 'aeolian', 'i bVI bVII v', 'Festival-sized minor drop'),
  p('Electronic & Hip-hop', 'melodicbass', 'Melodic bass', 'ionian', 'vi IV V iii', 'Emotional festival drop'),
  p('Electronic & Hip-hop', 'nightdrive', 'Night drive', 'aeolian', 'i bIII bVI bVII', 'Neon-lit and nostalgic'),
  p('Electronic & Hip-hop', 'ukgarage', 'UK garage', 'ionian', 'ii7 V7 Imaj7 IVmaj7', 'Jazzy, bouncy two-step'),
  p('Electronic & Hip-hop', 'soulsample', 'Soul sample loop', 'ionian', 'IVmaj7 iii7', 'Two warm chords, like a flipped soul record'),
  p('Electronic & Hip-hop', 'lofiminor', 'Lo-fi minor', 'aeolian', 'i9 bVImaj7 iv9 v9', 'Rainy-day minor 9ths'),
  p('Electronic & Hip-hop', 'malldream', 'Mall dream', 'ionian', 'IVmaj7 iii7 ii7 V7', 'Hazy, nostalgic vaporwave'),
  p('Electronic & Hip-hop', 'afrogroove', 'Afro groove', 'ionian', 'Imaj7 iii7 IVmaj7 V7', 'Sunny and rolling'),
  p('Electronic & Hip-hop', 'trap', 'Trap minor', 'aeolian', 'i iv bVI V', 'Sinister; the major V is borrowed'),
  p('Electronic & Hip-hop', 'drill', 'Drill', 'aeolian', 'i iv bVI v', 'Cold, dark and sliding'),
  p('Electronic & Hip-hop', 'phonk', 'Phonk', 'phrygian', 'i iv bII i', 'Dark, gritty and hypnotic'),
  p('Electronic & Hip-hop', 'dubstep', 'Dubstep', 'aeolian', 'i bVI iv bVII', 'Heavy, half-time darkness'),
  p('Electronic & Hip-hop', 'hyperpop', 'Hyperpop', 'ionian', 'IV V I vi', 'Bright, frantic and sugary'),
  p('Electronic & Hip-hop', 'onechord', 'One-chord groove', 'dorian', 'i7', 'A single chord: all about rhythm and sound'),

  p('Jazz', 'twofive', 'ii–V–I', 'ionian', 'ii7 V7 Imaj7 Imaj7', 'The core move of jazz'),
  p('Jazz', 'turnaround', 'Jazz turnaround', 'ionian', 'Imaj7 vi7 ii7 V7', 'Loops back home smoothly'),
  p('Jazz', 'minortwofive', 'Minor ii–V–i', 'aeolian', 'iiø7 V7 i7 i7', 'Moody and smooth'),
  p('Jazz', 'secondary', 'Secondary turnaround', 'ionian', 'Imaj7 VI7 ii7 V7', 'The VI7 pulls hard into ii'),
  p('Jazz', 'circle', 'Circle of fifths', 'ionian', 'iii7 vi7 ii7 V7', 'Each chord falls a fifth'),
  p('Jazz', 'tritone', 'Tritone sub', 'ionian', 'ii7 bII7 Imaj7 Imaj7', 'Slides down chromatically home'),
  p('Jazz', 'backdoor', 'Backdoor cadence', 'ionian', 'iv7 bVII7 Imaj7 Imaj7', 'Sneaks home the back way'),
  p('Jazz', 'bossa', 'Bossa turn', 'ionian', 'Imaj7 II7 ii7 bII7', 'Breezy and Brazilian'),
  p('Jazz', 'cycle', 'Falling leaves cycle', 'ionian', 'ii7 V7 Imaj7 IVmaj7 viiø7 III7 vi7 vi7', 'The classic eight-bar circle into the relative minor'),
  p('Jazz', 'secondarychain', 'Secondary chain', 'ionian', 'iii7 VI7 ii7 V7', 'Every chord pulls into the next'),
  p('Jazz', 'minorjazzblues', 'Minor jazz turnaround', 'aeolian', 'i7 iv7 bVI7 V7', 'Dark and swinging'),
  p('Jazz', 'minorbossa', 'Minor bossa', 'aeolian', 'i7 iv7 iiø7 V7', 'Cool, sad and breezy'),
  p('Jazz', 'twofivevamp', 'Two-five vamp', 'ionian', 'ii7 V7', 'The jazz workhorse, looping'),
  p('Jazz', 'modalvamp', 'Modal vamp', 'dorian', 'i7 ii7', 'Floating Dorian minor, cool and open'),
  p('Jazz', 'rhythmbridge', 'Rhythm bridge', 'ionian', 'III7 VI7 II7 V7', 'A chain of dominants falling home'),
  p('Jazz', 'jazzballadturn', 'Ballad turnaround', 'ionian', 'Imaj7 #i°7 ii7 V7', 'Tender and classic'),
  p('Jazz', 'chromaticturn', 'Chromatic turnaround', 'ionian', 'Imaj7 bIII7 bVImaj7 bII7', 'A sliding, chromatic way home'),
  p('Jazz', 'chromaticdescent', 'Chromatic descent', 'ionian', 'iii7 bIII7 ii7 bII7', 'Sliding down by half steps'),
  p('Jazz', 'minorlinecliche', 'Minor line cliché', 'aeolian', 'i imaj7 i7 i6', 'A falling line inside one minor chord: spy-movie cool'),
  p('Jazz', 'giant', 'Giant cycle', 'ionian', 'Imaj7 bIII7 bVImaj7 VII7 IIImaj7 V7 Imaj7 Imaj7', 'Keys spinning in thirds, famously tricky'),

  p('Blues', 'shuffle', 'Blues shuffle', 'mixolydian', 'I7 IV7 I7 V7', 'The classic shuffle feel'),
  p('Blues', 'eightbar', '8-bar blues', 'mixolydian', 'I7 V7 IV7 IV7 I7 V7 I7 V7', 'A full blues verse in 8 bars'),
  p('Blues', 'boogie', 'Two-chord boogie', 'mixolydian', 'I7 IV7', 'Simple and greasy'),
  p('Blues', 'quickchange', 'Quick-change blues', 'mixolydian', 'I7 IV7 I7 I7 IV7 IV7 I7 V7', 'Jumps to IV early, then home'),
  p('Blues', 'jazzblues', 'Blues turnaround', 'mixolydian', 'I7 VI7 ii7 V7', 'The jazzy way back to the top'),
  p('Blues', 'minorblues', 'Minor blues', 'aeolian', 'i7 iv7 i7 V7', 'Dark and soulful'),
  p('Blues', 'minor8bar', 'Minor 8-bar blues', 'aeolian', 'i7 i7 iv7 iv7 bVI7 V7 i7 V7', 'A dark blues verse in 8 bars'),
  p('Blues', 'minorboogie', 'Minor boogie', 'aeolian', 'i7 iv7 i7 i7', 'Dark and grooving'),
  p('Blues', 'bluesending', 'Blues ending', 'mixolydian', 'V7 IV7 I7 V7', 'The last four bars of a blues'),
  p('Blues', 'gospelblues', 'Gospel blues', 'mixolydian', 'I7 IV7 #iv°7 I7', 'Churchy blues with a passing chord'),

  p('Folk & Country', 'threechords', 'Three-chord classic', 'ionian', 'I IV V I', 'Home, away, tension, home'),
  p('Folk & Country', 'campfire', 'Campfire', 'ionian', 'I V IV I', 'Easygoing'),
  p('Folk & Country', 'country', 'Country lift', 'ionian', 'I II IV I', 'The major II adds a twang'),
  p('Folk & Country', 'strum', 'Folk strum', 'ionian', 'I Isus4 IV I', 'Open and ringing'),
  p('Folk & Country', 'folkballad', 'Folk ballad', 'ionian', 'I iii IV I', 'Gentle and honest'),
  p('Folk & Country', 'countryballad', 'Country ballad', 'ionian', 'I iii IV V', 'Open-road and sincere'),
  p('Folk & Country', 'countrygospel', 'Country gospel', 'ionian', 'I I7 IV I', 'Front-porch and churchy'),
  p('Folk & Country', 'honkytonk', 'Honky-tonk', 'ionian', 'I I7 IV IV', 'Barroom swagger'),
  p('Folk & Country', 'gentleair', 'Gentle air', 'ionian', 'I ii IV I', 'Simple and pastoral'),
  p('Folk & Country', 'mixofolk', 'Mixolydian folk', 'mixolydian', 'I bVII I bVII', 'Bright and ancient-sounding'),
  p('Folk & Country', 'modalfolk', 'Modal folk', 'dorian', 'i bVII i bVII', 'Ancient and Celtic'),
  p('Folk & Country', 'celtic', 'Celtic reel', 'dorian', 'i bVII bIII bVII', 'Lively and ancient'),
  p('Folk & Country', 'appalachian', 'Appalachian', 'dorian', 'i IV i bVII', 'Old-time mountain music'),
  p('Folk & Country', 'shanty', 'Sea shanty', 'aeolian', 'i bVII i V', 'Stomping minor singalong'),
  p('Folk & Country', 'oldballad', 'Old ballad', 'aeolian', 'i bIII bVII i', 'Like a song passed down for centuries'),
  p('Folk & Country', 'western', 'Western ballad', 'aeolian', 'i iv bVII i', 'A lonely desert road'),

  p('Cinematic', 'heroic', 'Heroic', 'ionian', 'I bVI bVII I', 'Triumphant film-score lift'),
  p('Cinematic', 'victory', 'Victory', 'ionian', 'bVI bVII I I', 'The triumphant arrival'),
  p('Cinematic', 'quest', 'Quest', 'ionian', 'I IV bVII I', 'Adventurous and bright'),
  p('Cinematic', 'wonder', 'Bittersweet wonder', 'ionian', 'I III IV iv', 'Magical, a little sad'),
  p('Cinematic', 'uplift', 'Uplifting twist', 'ionian', 'I III vi IV', 'Hopeful with a surprising lift'),
  p('Cinematic', 'storybook', 'Storybook', 'ionian', 'I III IV I', 'Once upon a time'),
  p('Cinematic', 'lydian', 'Lydian wonder', 'lydian', 'I II I II', 'Floating sci-fi magic'),
  p('Cinematic', 'lydianfloat', 'Lydian float', 'lydian', 'Imaj7 II', 'Weightless and full of wonder'),
  p('Cinematic', 'awe', 'Awe', 'lydian', 'I II iii II', 'Wide-eyed and luminous'),
  p('Cinematic', 'nostalgia', 'Nostalgia', 'ionian', 'IV iv I I', 'A sigh for the past'),
  p('Cinematic', 'mediant', 'Chromatic mediant', 'ionian', 'I bVI I bVI', 'Mysterious, shifting, cinematic'),
  p('Cinematic', 'somber', 'Somber march', 'aeolian', 'i iv v i', 'Grave and steady'),
  p('Cinematic', 'suspense', 'Suspense', 'aeolian', 'i bVI i bVI', 'Something is about to happen'),
  p('Cinematic', 'darkcadence', 'Dark cadence', 'aeolian', 'iv V i i', 'Tension resolving into darkness'),
  p('Cinematic', 'risingsorrow', 'Rising sorrow', 'aeolian', 'bVI bVII i i', 'Grief turning into resolve'),
  p('Cinematic', 'mystery', 'Mystery', 'aeolian', 'i v bVI iv', 'Unanswered questions'),
  p('Cinematic', 'villain', 'Villain', 'aeolian', 'i iv bII V', 'Sinister and grand'),
  p('Cinematic', 'menace', 'Phrygian menace', 'phrygian', 'i bII', 'Dark and threatening'),
  p('Cinematic', 'dread', 'Dread', 'aeolian', 'i bII i bII', 'Creeping, half-step horror'),

  p('Classical & World', 'canon', 'Canon', 'ionian', 'I V vi iii IV I IV V', 'Stately and warm: the classic descending pattern'),
  p('Classical & World', 'andalusian', 'Andalusian cadence', 'aeolian', 'i bVII bVI V', 'Descending and fiery: flamenco drama'),
  p('Classical & World', 'fifths', 'Falling fifths', 'ionian', 'vi ii V I', 'Each chord falls a fifth into home'),
  p('Classical & World', 'amen', 'Amen cadence', 'ionian', 'IV I', "A gentle 'amen'"),
  p('Classical & World', 'hymn', 'Hymn', 'ionian', 'I IV I V I IV V I', 'Plain, warm and churchlike'),
  p('Classical & World', 'picardy', 'Minor to major', 'aeolian', 'i iv V I', 'Dark, ending in light'),
  p('Classical & World', 'tango', 'Tango drama', 'aeolian', 'i iv V i', 'Passionate and theatrical'),
  p('Classical & World', 'neapolitan', 'Neapolitan cadence', 'aeolian', 'i bII V i', 'Dramatic classical minor ending'),
  p('Classical & World', 'baroque', 'Baroque sequence', 'ionian', 'I IV vii° iii vi ii V I', 'The full circle of the key, Bach-style'),
  p('Classical & World', 'folia', 'La Folia', 'aeolian', 'i V i bVII bIII bVII i V', 'A centuries-old dramatic dance'),
  p('Classical & World', 'romanesca', 'Romanesca', 'aeolian', 'bIII bVII i V', 'Renaissance grace'),
  p('Classical & World', 'lament', 'Lament', 'aeolian', 'i v iv V', 'Mournful and noble'),
  p('Classical & World', 'minorcircle', 'Minor circle', 'aeolian', 'i iv bVII bIII bVI ii° V i', 'The full minor circle, Baroque-style'),
  p('Classical & World', 'island', 'Island two-step', 'ionian', 'I IV', 'Easygoing reggae and calypso sway'),
  p('Classical & World', 'calypso', 'Calypso', 'ionian', 'I V I V', 'A breezy island bounce'),
  p('Classical & World', 'highlife', 'Highlife', 'ionian', 'I V IV V', 'Sunny West African guitar sway'),
  p('Classical & World', 'highlandlament', 'Highland lament', 'aeolian', 'i v bVI bVII', 'Misty and proud'),
  p('Classical & World', 'flamenco', 'Flamenco', 'phrygian', 'i bII bIII bII', 'Fiery Spanish color'),
  p('Classical & World', 'phrygiandescent', 'Phrygian descent', 'phrygian', 'i bVII bVI bII', 'Spanish fire stepping down'),
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

/** The progression's chords in `tonic`. */
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
