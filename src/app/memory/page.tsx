"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Spinner, card } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";

/**
 * Memory: a knowledge graph of the user's world, grown from what they say.
 * Force-directed layout computed client-side, rendered as SVG. "me" sits at
 * the center; node size grows with how often something comes up.
 */

interface GNode {
  id: string;
  label: string;
  type: "person" | "place" | "activity" | "thing" | "feeling";
  count: number;
}
interface GEdge {
  source: string;
  target: string;
  label: string;
  count: number;
}
interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  sentenceCount: number;
}

const TYPE_COLOR: Record<string, string> = {
  me: "#f59e0b", // amber — the center of the map
  person: "#fb7185", // rose
  place: "#38bdf8", // sky
  activity: "#4ade80", // green
  thing: "#a78bfa", // violet
  feeling: "#facc15", // yellow
};

interface Pos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export default function MemoryPage() {
  return (
    <AuthGuard>
      <Memory />
    </AuthGuard>
  );
}

function Memory() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [positions, setPositions] = useState<Map<string, Pos>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const rafRef = useRef(0);

  // Canvas grows with the graph so a well-fed map stays legible.
  const n = graph?.nodes.length ?? 0;
  const W = n > 40 ? 900 : 640;
  const H = n > 40 ? 700 : 480;

  useEffect(() => {
    apiFetch("/api/graph")
      .then((r) => r.json())
      .then(setGraph)
      .catch(() => setGraph({ nodes: [], edges: [], sentenceCount: 0 }));
  }, []);

  // All nodes incl. the implicit "me" hub.
  const nodes = useMemo<GNode[]>(() => {
    if (!graph) return [];
    const hasMe = graph.edges.some((e) => e.source === "me" || e.target === "me");
    const me: GNode = { id: "me", label: "Me", type: "person", count: 1 };
    return graph.nodes.length > 0 || hasMe ? [me, ...graph.nodes] : [];
  }, [graph]);

  // Force simulation: repulsion + edge springs + gravity to center.
  useEffect(() => {
    if (nodes.length === 0 || !graph) return;
    const pos = new Map<string, Pos>();
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const r = n.id === "me" ? 0 : 140 + (i % 3) * 40;
      pos.set(n.id, { x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r, vx: 0, vy: 0 });
    });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ticks = 0;
    const maxTicks = 300;

    const step = () => {
      const arr = nodes.map((n) => ({ n, p: pos.get(n.id)! }));
      // repulsion
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i].p;
          const b = arr[j].p;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 100);
          const f = (nodes.length > 40 ? 4200 : 2600) / d2;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          a.vx += dx * f;
          a.vy += dy * f;
          b.vx -= dx * f;
          b.vy -= dy * f;
        }
      }
      // springs
      for (const e of graph.edges) {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const f = (d - 110) * 0.01;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      // gravity + integrate
      for (const { n, p } of arr) {
        const g = n.id === "me" ? 0.08 : 0.012;
        p.vx += (W / 2 - p.x) * g;
        p.vy += (H / 2 - p.y) * g;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x = Math.min(W - 40, Math.max(40, p.x + p.vx));
        p.y = Math.min(H - 32, Math.max(32, p.y + p.vy));
      }
      setPositions(new Map(pos));
      ticks++;
      if (ticks < maxTicks) rafRef.current = requestAnimationFrame(step);
    };

    if (reduced) {
      // Settle instantly — no animated layout for reduced motion.
      ticks = maxTicks; // prevent step() from scheduling frames
      for (let i = 0; i < 250; i++) step();
    } else {
      rafRef.current = requestAnimationFrame(step);
    }
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, graph]);

  const selectedEdges = useMemo(
    () =>
      selected && graph
        ? graph.edges.filter((e) => e.source === selected || e.target === selected)
        : [],
    [selected, graph]
  );

  if (graph === null) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-stone-400" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
        <p className="mt-1 text-sm text-stone-400">
          A map of your world, built from what you say. The more something comes up, the bigger it gets.
        </p>
      </header>

      {nodes.length === 0 ? (
        <div className={`${card} border-dashed text-sm text-stone-400`}>
          Nothing here yet — your map grows as you speak. Say a few things on the{" "}
          <a href="/app" className="text-amber-400 underline-offset-2 hover:underline">
            Speak
          </a>{" "}
          or{" "}
          <a href="/converse" className="text-amber-400 underline-offset-2 hover:underline">
            Conversation
          </a>{" "}
          pages and check back.
        </div>
      ) : (
        <>
          <div className="rise-in overflow-hidden rounded-2xl bg-stone-900/40 shadow-xl shadow-black/30 ring-1 ring-white/10">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Knowledge graph">
              {/* edges */}
              {graph.edges.map((e, i) => {
                const a = positions.get(e.source);
                const b = positions.get(e.target);
                if (!a || !b) return null;
                const dim = selected && e.source !== selected && e.target !== selected;
                return (
                  <g key={i} opacity={dim ? 0.12 : 0.5}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#78716c" strokeWidth={Math.min(1 + e.count * 0.4, 3)} />
                    {!dim && selected && (
                      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fill="#a8a29e" fontSize="9">
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* nodes */}
              {nodes.map((n) => {
                const p = positions.get(n.id);
                if (!p) return null;
                const r = n.id === "me" ? 18 : Math.min(8 + n.count * 2.5, 22);
                const color = n.id === "me" ? TYPE_COLOR.me : TYPE_COLOR[n.type];
                const dim =
                  selected &&
                  selected !== n.id &&
                  !selectedEdges.some((e) => e.source === n.id || e.target === n.id);
                return (
                  <g
                    key={n.id}
                    opacity={dim ? 0.2 : 1}
                    onClick={() => setSelected(selected === n.id ? null : n.id)}
                    className="cursor-pointer transition-opacity"
                  >
                    <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={0.18} stroke={color} strokeWidth="1.5" />
                    <text x={p.x} y={p.y + r + 11} textAnchor="middle" fill="#e7e5e4" fontSize="10" fontWeight={n.id === "me" ? 700 : 400}>
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400">
            {Object.entries({ person: "People", place: "Places", activity: "Activities", thing: "Things", feeling: "Feelings" }).map(
              ([type, label]) => (
                <span key={type} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[type] }} />
                  {label}
                </span>
              )
            )}
            <span className="ml-auto">
              {graph.nodes.length} memories from {graph.sentenceCount} sentence{graph.sentenceCount === 1 ? "" : "s"}
            </span>
          </div>

          {selected && (
            <div className={`rise-in mt-4 ${card}`}>
              <h3 className="font-semibold">{nodes.find((n) => n.id === selected)?.label}</h3>
              <ul className="mt-2 space-y-1 text-sm text-stone-300">
                {selectedEdges.map((e, i) => (
                  <li key={i}>
                    {nodes.find((n) => n.id === e.source)?.label ?? e.source}{" "}
                    <span className="text-amber-400">{e.label}</span>{" "}
                    {nodes.find((n) => n.id === e.target)?.label ?? e.target}
                    {e.count > 1 && <span className="text-stone-500"> ×{e.count}</span>}
                  </li>
                ))}
                {selectedEdges.length === 0 && <li className="text-stone-500">No connections yet.</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}
