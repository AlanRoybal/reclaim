/**
 * Sign vocabulary: isolated word signs + A–Z fingerspelling.
 * Isolated-sign recognition over a fixed, calibrated vocabulary — NOT
 * continuous ASL translation. Consecutive fingerspelled letters are collapsed
 * into a word before sentence generation (C A T → CAT).
 */
export const WORDS = [
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

export const LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
] as const;

export const VOCAB: readonly string[] = [...WORDS, ...LETTERS];

export type Gloss = string;

/** Collapse runs of fingerspelled letters into words: ["GO","C","A","T"] → ["GO","CAT"]. */
export function collapseFingerspelling(glosses: Gloss[]): Gloss[] {
  const letterSet = new Set<string>(LETTERS);
  const out: Gloss[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) {
      out.push(run.join(""));
      run = [];
    }
  };
  for (const g of glosses) {
    if (letterSet.has(g)) run.push(g);
    else {
      flush();
      out.push(g);
    }
  }
  flush();
  return out;
}
