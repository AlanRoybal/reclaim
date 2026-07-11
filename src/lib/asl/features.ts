/**
 * Landmark → feature-vector conversion.
 *
 * Each captured frame holds up to two hands of 21 MediaPipe landmarks (x, y, z).
 * We normalize each hand (wrist at origin, scaled by hand span) so features are
 * position/size invariant, and concatenate [left, right] with zero-padding for
 * missing hands. 2 hands x 21 landmarks x 3 coords = 126 dims per frame.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface CapturedFrame {
  t: number; // ms timestamp
  left: Landmark[] | null;
  right: Landmark[] | null;
}

export const FRAME_DIMS = 126;

function normalizeHand(lms: Landmark[]): number[] {
  const wrist = lms[0];
  // Scale by max distance from wrist so features are size-invariant.
  let scale = 0;
  for (const lm of lms) {
    const d = Math.hypot(lm.x - wrist.x, lm.y - wrist.y, lm.z - wrist.z);
    if (d > scale) scale = d;
  }
  if (scale < 1e-6) scale = 1;
  const out: number[] = [];
  for (const lm of lms) {
    out.push((lm.x - wrist.x) / scale, (lm.y - wrist.y) / scale, (lm.z - wrist.z) / scale);
  }
  return out;
}

/** Also keep raw wrist position (normalized image coords) so motion across the frame matters. */
export function frameToFeatures(f: CapturedFrame): number[] {
  const feat: number[] = [];
  for (const hand of [f.left, f.right]) {
    if (hand && hand.length === 21) {
      feat.push(...normalizeHand(hand));
    } else {
      for (let i = 0; i < 63; i++) feat.push(0);
    }
  }
  return feat;
}

/** Wrist positions in image space — used for motion energy & location cues. */
export function wristPositions(f: CapturedFrame): { lx: number; ly: number; rx: number; ry: number } {
  return {
    lx: f.left?.[0]?.x ?? -1,
    ly: f.left?.[0]?.y ?? -1,
    rx: f.right?.[0]?.x ?? -1,
    ry: f.right?.[0]?.y ?? -1,
  };
}

/** Motion energy between two frames: mean landmark displacement (image space). */
export function motionEnergy(a: CapturedFrame, b: CapturedFrame): number {
  let sum = 0;
  let n = 0;
  for (const side of ["left", "right"] as const) {
    const ha = a[side];
    const hb = b[side];
    if (ha && hb) {
      for (let i = 0; i < 21; i++) {
        sum += Math.hypot(hb[i].x - ha[i].x, hb[i].y - ha[i].y);
        n++;
      }
    }
  }
  return n > 0 ? sum / n : 0;
}

export function hasHands(f: CapturedFrame): boolean {
  return !!(f.left || f.right);
}

/** Resample a sequence of feature vectors to a fixed length (linear interpolation). */
export function resample(seq: number[][], target: number): number[][] {
  if (seq.length === 0) return [];
  if (seq.length === target) return seq;
  const out: number[][] = [];
  for (let i = 0; i < target; i++) {
    const pos = (i * (seq.length - 1)) / (target - 1 || 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, seq.length - 1);
    const frac = pos - lo;
    const v = new Array(seq[0].length);
    for (let d = 0; d < seq[0].length; d++) {
      v[d] = seq[lo][d] * (1 - frac) + seq[hi][d] * frac;
    }
    out.push(v);
  }
  return out;
}
