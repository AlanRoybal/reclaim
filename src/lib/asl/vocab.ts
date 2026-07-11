/**
 * Fixed sign vocabulary for the MVP. Isolated-sign recognition over a small,
 * reliable vocabulary — NOT continuous ASL translation.
 */
export const VOCAB = [
  "ME",
  "YOU",
  "WANT",
  "NEED",
  "GO",
  "STOP",
  "HELP",
  "PLEASE",
  "THANK-YOU",
  "YES",
  "NO",
  "COFFEE",
  "WATER",
  "FOOD",
  "EAT",
  "DRINK",
  "HOME",
  "WORK",
  "LOVE",
  "HAPPY",
  "SAD",
  "TIRED",
  "BATHROOM",
  "MORE",
] as const;

export type Gloss = (typeof VOCAB)[number];
