/**
 * Semantic style matching — DigitalOcean serverless embeddings (GTE Large).
 *
 * The user's corpus is embedded once at upload; at speak time we embed the
 * sentence being said and retrieve the most *similar* past messages as
 * few-shot examples. Saying something about food pulls examples of how the
 * user texts about food — much stronger style conditioning than random or
 * length-based sampling.
 */

const EMBED_MODEL = "gte-large-en-v1.5";

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${process.env.DO_INFERENCE_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.DO_INFERENCE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`embeddings failed (${res.status})`);
  const d = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  const out: number[][] = new Array(texts.length);
  for (const item of d.data) out[item.index] = item.embedding;
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function topKSimilar(
  query: number[],
  vectors: number[][],
  lines: string[],
  k: number
): string[] {
  return vectors
    .map((v, i) => ({ i, score: cosine(query, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ i }) => lines[i]);
}
