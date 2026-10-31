export type ProgressionChord = {
  id: string
  symbol: string
  roman: string
  /** Length in beats */
  beats: number
}

export const BEATS_PER_BAR = 4

export const secondsPerBeat = (bpm: number) => 60 / bpm
