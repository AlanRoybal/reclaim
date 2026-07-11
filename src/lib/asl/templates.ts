/**
 * Per-user sign templates (calibration) + nearest-neighbor DTW classifier.
 *
 * The user records each vocabulary sign once or twice in Calibrate mode;
 * templates are stored in localStorage. Classification compares a segment's
 * feature sequence to every template and returns the best label with a
 * confidence derived from the margin between the best and second-best label.
 */

import { CapturedFrame, frameToFeatures, resample } from "./features";
import { dtwDistance } from "./dtw";
import type { Gloss } from "./vocab";

const STORAGE_KEY = "reclaim.templates.v1";
const SEQ_LEN = 48;

export interface Template {
  gloss: Gloss;
  features: number[][];
}

export function segmentToFeatures(frames: CapturedFrame[]): number[][] {
  return resample(frames.map(frameToFeatures), SEQ_LEN);
}

export function loadTemplates(): Template[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveTemplate(gloss: Gloss, frames: CapturedFrame[]) {
  const templates = loadTemplates();
  templates.push({ gloss, features: segmentToFeatures(frames) });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function clearTemplates(gloss?: Gloss) {
  if (!gloss) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(loadTemplates().filter((t) => t.gloss !== gloss))
  );
}

export function templateCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of loadTemplates()) counts[t.gloss] = (counts[t.gloss] ?? 0) + 1;
  return counts;
}

export interface Classification {
  gloss: Gloss | null;
  confidence: number; // 0..1
  distance: number;
}

export function classifySegment(frames: CapturedFrame[], templates: Template[]): Classification {
  if (templates.length === 0) return { gloss: null, confidence: 0, distance: Infinity };
  const feat = segmentToFeatures(frames);

  // Best distance per gloss.
  const best: Record<string, number> = {};
  for (const t of templates) {
    const d = dtwDistance(feat, t.features);
    if (best[t.gloss] === undefined || d < best[t.gloss]) best[t.gloss] = d;
  }
  const ranked = Object.entries(best).sort((a, b) => a[1] - b[1]);
  const [gloss, d1] = ranked[0];
  const d2 = ranked.length > 1 ? ranked[1][1] : d1 * 2;

  // Confidence from margin between best and runner-up (0.5 = tie, →1 = clear win).
  const margin = d2 > 1e-9 ? 1 - d1 / d2 : 0;
  const confidence = Math.max(0, Math.min(1, 0.5 + margin));
  return { gloss: gloss as Gloss, confidence, distance: d1 };
}
