/**
 * Dynamic Time Warping distance between two feature sequences.
 * Used for nearest-neighbor isolated-sign classification against
 * user-calibrated templates.
 */

function frameDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function dtwDistance(a: number[][], b: number[][], band = 12): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Infinity;
  const INF = Number.POSITIVE_INFINITY;
  let prev = new Array<number>(m + 1).fill(INF);
  let curr = new Array<number>(m + 1).fill(INF);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr.fill(INF);
    const jLo = Math.max(1, i - band);
    const jHi = Math.min(m, i + band);
    for (let j = jLo; j <= jHi; j++) {
      const cost = frameDist(a[i - 1], b[j - 1]);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m] / (n + m); // path-length normalized
}
