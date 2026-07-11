"use client";

/**
 * Trained sequence classifier (vocabulary-growth tier).
 *
 * A small TF.js MLP softmax model trained in-browser on the user's calibration
 * templates. With few classes DTW nearest-neighbor is hard to beat, but as the
 * vocabulary grows (words + A–Z fingerspelling) a trained decision boundary
 * scales better than pairwise DTW. We train when every calibrated class has
 * MIN_EXAMPLES and there are at least MIN_CLASSES; otherwise classification
 * falls back to DTW. Training takes well under a second for typical template
 * counts, entirely on-device.
 */

import * as tf from "@tensorflow/tfjs";
import type { CapturedFrame } from "./features";
import {
  classifySegment,
  segmentToFeatures,
  type Classification,
  type Template,
} from "./templates";

const MIN_EXAMPLES = 3;
const MIN_CLASSES = 3;

interface TrainedModel {
  model: tf.LayersModel;
  labels: string[];
  signature: string;
}

let cached: TrainedModel | null = null;

function signatureOf(templates: Template[]): string {
  const counts: Record<string, number> = {};
  for (const t of templates) counts[t.gloss] = (counts[t.gloss] ?? 0) + 1;
  return JSON.stringify(counts);
}

function eligible(templates: Template[]): string[] | null {
  const counts: Record<string, number> = {};
  for (const t of templates) counts[t.gloss] = (counts[t.gloss] ?? 0) + 1;
  const labels = Object.keys(counts);
  if (labels.length < MIN_CLASSES) return null;
  if (labels.some((l) => counts[l] < MIN_EXAMPLES)) return null;
  return labels.sort();
}

/** Train (or reuse) the softmax model for the current template set. */
export async function ensureModel(templates: Template[]): Promise<TrainedModel | null> {
  const labels = eligible(templates);
  if (!labels) return null;
  const signature = signatureOf(templates);
  if (cached?.signature === signature) return cached;

  cached?.model.dispose();
  cached = null;

  const xs = tf.tensor2d(templates.map((t) => t.features.flat()));
  const ys = tf.oneHot(
    templates.map((t) => labels.indexOf(t.gloss)),
    labels.length
  );

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [xs.shape[1]], units: 128, activation: "relu" }),
      tf.layers.dropout({ rate: 0.3 }),
      tf.layers.dense({ units: labels.length, activation: "softmax" }),
    ],
  });
  model.compile({ optimizer: tf.train.adam(1e-3), loss: "categoricalCrossentropy" });
  await model.fit(xs, ys, { epochs: 80, batchSize: 16, shuffle: true, verbose: 0 });
  xs.dispose();
  ys.dispose();

  cached = { model, labels, signature };
  return cached;
}

/**
 * Classify a segment: trained model when available, DTW otherwise.
 * Returns which method was used so the UI can surface it.
 */
export async function classifySmart(
  frames: CapturedFrame[],
  templates: Template[]
): Promise<Classification & { method: "model" | "dtw" }> {
  const trained = await ensureModel(templates);
  if (trained) {
    const feat = segmentToFeatures(frames).flat();
    const probs = tf.tidy(() => {
      const out = trained.model.predict(tf.tensor2d([feat])) as tf.Tensor;
      return out.dataSync();
    });
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    return {
      gloss: trained.labels[best],
      confidence: probs[best],
      distance: 1 - probs[best],
      method: "model",
    };
  }
  return { ...classifySegment(frames, templates), method: "dtw" };
}
