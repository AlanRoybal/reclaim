/**
 * Pause-based segmentation of a recorded landmark stream into isolated signs.
 *
 * A sign segment is a contiguous run of frames with hands present and motion
 * above a rest threshold. Segments are split whenever motion stays below the
 * threshold for PAUSE_MS (the user pauses between signs) or hands leave frame.
 */

import { CapturedFrame, motionEnergy, hasHands } from "./features";

export interface Segment {
  frames: CapturedFrame[];
  startMs: number;
  endMs: number;
}

const PAUSE_MS = 350; // low-motion gap that splits signs
const MIN_SEGMENT_MS = 250; // discard blips
const MOTION_THRESHOLD = 0.004; // mean landmark displacement per frame (image coords)

export function segmentFrames(frames: CapturedFrame[]): Segment[] {
  if (frames.length < 3) return [];

  // Smooth per-frame motion with a small moving average.
  const motion: number[] = frames.map((f, i) =>
    i === 0 ? 0 : motionEnergy(frames[i - 1], f)
  );
  const smooth: number[] = motion.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(motion.length - 1, i + 2); j++) {
      s += motion[j];
      n++;
    }
    return s / n;
  });

  const segments: Segment[] = [];
  let current: CapturedFrame[] = [];
  let lowSince: number | null = null;

  const flush = () => {
    if (current.length > 0) {
      const startMs = current[0].t;
      const endMs = current[current.length - 1].t;
      if (endMs - startMs >= MIN_SEGMENT_MS) {
        segments.push({ frames: current, startMs, endMs });
      }
      current = [];
    }
    lowSince = null;
  };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!hasHands(f)) {
      flush();
      continue;
    }
    const active = smooth[i] >= MOTION_THRESHOLD;
    if (active) {
      lowSince = null;
      current.push(f);
    } else if (current.length > 0) {
      if (lowSince === null) lowSince = f.t;
      if (f.t - lowSince >= PAUSE_MS) {
        flush();
      } else {
        current.push(f); // brief stillness inside a sign (holds are part of signs)
      }
    }
  }
  flush();
  return segments;
}
