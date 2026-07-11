import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";
import { getObjectText, putJson, userPrefix } from "@/lib/server/s3";

/**
 * Personal knowledge graph, built from what the user actually says.
 *
 * Every spoken sentence is mined (Llama 3.3 on DO Gradient) for entities —
 * people, places, activities, things, feelings — and the relations between
 * the user and them. Mentions merge into a per-user graph in Spaces: node
 * weight grows with repetition, so over time the graph becomes a map of the
 * user's world. Extraction is fire-and-forget from the client and must never
 * block speech.
 */

export interface GraphNode {
  id: string; // normalized name
  label: string; // display name
  type: "person" | "place" | "activity" | "thing" | "feeling";
  count: number;
  lastSeen: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  count: number;
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sentenceCount: number;
}

const EMPTY: Graph = { nodes: [], edges: [], sentenceCount: 0 };
const ME = "me";

const EXTRACT_SYSTEM =
  "You extract a personal knowledge graph from one sentence someone said. " +
  'Return JSON: {"entities":[{"name":"...","type":"person|place|activity|thing|feeling"}],' +
  '"relations":[{"from":"...","rel":"...","to":"..."}]}\n' +
  'Rules: the speaker is always "me". Only include entities actually mentioned. ' +
  'Relations are short verb phrases ("likes", "went to", "works with"). ' +
  'Every relation endpoint must be "me" or a listed entity name. ' +
  'If nothing meaningful, return {"entities":[],"relations":[]}. Reply with ONLY the JSON.';

function norm(name: string): string {
  return name.trim().toLowerCase();
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await getObjectText(`${userPrefix(user.sub)}graph.json`);
  return NextResponse.json(text ? (JSON.parse(text) as Graph) : EMPTY);
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const baseURL = process.env.DO_INFERENCE_BASE_URL;
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  const model = process.env.DO_INFERENCE_MODEL;
  if (!baseURL || !apiKey || !model) {
    return NextResponse.json({ error: "inference not configured" }, { status: 501 });
  }

  const { text } = (await req.json()) as { text: string };
  if (!text?.trim() || text.length > 500) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  try {
    const client = new OpenAI({ baseURL, apiKey });
    const res = await client.chat.completions.create({
      model,
      max_tokens: 400,
      temperature: 0.1,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: text.trim() },
      ],
    });
    const raw = (res.choices[0]?.message?.content ?? "{}")
      .replace(/^```(?:json)?|```$/gm, "")
      .trim();
    const parsed = JSON.parse(raw) as {
      entities?: { name: string; type: GraphNode["type"] }[];
      relations?: { from: string; rel: string; to: string }[];
    };

    const key = `${userPrefix(user.sub)}graph.json`;
    const existing = await getObjectText(key);
    const graph: Graph = existing ? JSON.parse(existing) : { ...EMPTY, nodes: [], edges: [] };
    const now = new Date().toISOString();
    const types = new Set(["person", "place", "activity", "thing", "feeling"]);
    const known = new Set([ME, ...(parsed.entities ?? []).map((e) => norm(e.name))]);

    for (const e of parsed.entities ?? []) {
      const id = norm(e.name);
      if (!id || id === ME || !types.has(e.type)) continue;
      const node = graph.nodes.find((n) => n.id === id);
      if (node) {
        node.count++;
        node.lastSeen = now;
      } else {
        graph.nodes.push({ id, label: e.name.trim(), type: e.type, count: 1, lastSeen: now });
      }
    }

    for (const r of parsed.relations ?? []) {
      const s = norm(r.from);
      const t = norm(r.to);
      if (!known.has(s) || !known.has(t) || s === t || !r.rel?.trim()) continue;
      const edge = graph.edges.find((e) => e.source === s && e.target === t && e.label === r.rel.trim());
      if (edge) edge.count++;
      else graph.edges.push({ source: s, target: t, label: r.rel.trim(), count: 1 });
    }

    graph.sentenceCount++;
    await putJson(key, graph);
    return NextResponse.json({ ok: true, nodes: graph.nodes.length, edges: graph.edges.length });
  } catch {
    // Extraction is best-effort — never surface failures to the speech flow.
    return NextResponse.json({ ok: false });
  }
}
