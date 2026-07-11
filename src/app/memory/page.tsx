"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";

/**
 * Memory: a living map of the user's world, grown from what they say.
 * Rendered as a neural field — glowing memory dots in a particle haze,
 * linked by fine threads, with "Me" burning at the center.
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
  me: "#f6a821",
  person: "#f25d78",
  place: "#37c98e",
  activity: "#5b8cff",
  thing: "#d24bd0",
  feeling: "#c9b83a",
};
const TYPE_LABEL: Record<string, string> = {
  person: "people",
  place: "places",
  activity: "activities",
  thing: "things",
  feeling: "feelings",
};
const THREAD = "#67d4c4";

const W = 1200;
const H = 800;

interface Pos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Deterministic PRNG so the dust field is stable across renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  useEffect(() => {
    apiFetch("/api/graph")
      .then((r) => r.json())
      .then(setGraph)
      .catch(() => setGraph({ nodes: [], edges: [], sentenceCount: 0 }));
  }, []);

  const nodes = useMemo<GNode[]>(() => {
    if (!graph) return [];
    if (graph.nodes.length === 0) return [];
    return [{ id: "me", label: "Me", type: "person", count: 1 }, ...graph.nodes];
  }, [graph]);

  // Ambient dust: a soft particle haze around the graph.
  const dust = useMemo(() => {
    const rand = mulberry32(7);
    const pts: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 900; i++) {
      // gaussian-ish cluster around center via averaged uniforms
      const gx = (rand() + rand() + rand()) / 3;
      const gy = (rand() + rand() + rand()) / 3;
      pts.push({
        x: W / 2 + (gx - 0.5) * W * 1.15,
        y: H / 2 + (gy - 0.5) * H * 1.15,
        r: 0.6 + rand() * 1.2,
        o: 0.12 + rand() * 0.38,
      });
    }
    return pts;
  }, []);

  // Force simulation: repulsion + edge springs + gravity to center.
  useEffect(() => {
    if (nodes.length === 0 || !graph) return;
    const pos = new Map<string, Pos>();
    nodes.forEach((n, i) => {
      // Hash the id for the starting angle so types mix instead of clustering.
      let h = 0;
      for (const ch of n.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
      const angle = ((h >>> 0) % 360) * (Math.PI / 180);
      const r = n.id === "me" ? 0 : 150 + ((h >>> 8) % 4) * 50 + (i % 2) * 20;
      pos.set(n.id, { x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r, vx: 0, vy: 0 });
    });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ticks = 0;
    const maxTicks = 320;

    const step = () => {
      const arr = nodes.map((n) => ({ n, p: pos.get(n.id)! }));
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i].p;
          const b = arr[j].p;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 100);
          const f = 5200 / d2;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          a.vx += dx * f;
          a.vy += dy * f;
          b.vx -= dx * f;
          b.vy -= dy * f;
        }
      }
      for (const e of graph.edges) {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const f = (d - 130) * 0.01;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const { n, p } of arr) {
        const g = n.id === "me" ? 0.09 : 0.014;
        p.vx += (W / 2 - p.x) * g;
        p.vy += (H / 2 - p.y) * g;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x = Math.min(W - 60, Math.max(60, p.x + p.vx));
        p.y = Math.min(H - 50, Math.max(50, p.y + p.vy));
      }
      setPositions(new Map(pos));
      ticks++;
      if (ticks < maxTicks) rafRef.current = requestAnimationFrame(step);
    };

    if (reduced) {
      ticks = maxTicks;
      for (let i = 0; i < 260; i++) step();
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

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of graph?.nodes ?? []) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [graph]);

  if (graph === null) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-stone-400" />
      </main>
    );
  }

  if (nodes.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
        <div className="mt-5 rounded-xl border border-dashed border-stone-700 p-5 text-sm text-stone-400">
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
      </main>
    );
  }

  const mePos = positions.get("me");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div
        className="rise-in relative overflow-hidden rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10"
        style={{ background: "#152638" }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Memory graph">
          <defs>
            <filter id="soften" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
            <filter id="halo" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          {/* ambient dust */}
          <g fill={THREAD}>
            {dust.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />
            ))}
          </g>

          {/* threads */}
          {graph.edges.map((e, i) => {
            const a = positions.get(e.source);
            const b = positions.get(e.target);
            if (!a || !b) return null;
            const focus = selected && (e.source === selected || e.target === selected);
            const dim = selected && !focus;
            return (
              <g key={i}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={THREAD}
                  strokeWidth={focus ? 1.5 : 0.9}
                  opacity={dim ? 0.06 : focus ? 0.9 : 0.42}
                />
                {focus && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 5}
                    textAnchor="middle"
                    fill="#bfeee5"
                    fontSize="11"
                    opacity="0.9"
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* memory dots — layered glow: halo, bloom, core */}
          {nodes.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            const isMe = n.id === "me";
            const r = isMe ? 17 : Math.min(6 + Math.sqrt(n.count) * 3.2, 20);
            const color = isMe ? TYPE_COLOR.me : TYPE_COLOR[n.type];
            const neighbor =
              selected && selectedEdges.some((e) => e.source === n.id || e.target === n.id);
            const dim = selected && selected !== n.id && !neighbor;
            const showLabel = isMe || selected === n.id || neighbor;
            return (
              <g
                key={n.id}
                opacity={dim ? 0.18 : 1}
                onClick={() => setSelected(selected === n.id ? null : n.id)}
                className="cursor-pointer transition-opacity duration-300"
              >
                <circle cx={p.x} cy={p.y} r={r * 2.1} fill={color} opacity="0.25" filter="url(#halo)" />
                <circle cx={p.x} cy={p.y} r={r * 1.05} fill={color} opacity="0.9" filter="url(#soften)" />
                <circle
                  cx={p.x - r * 0.12}
                  cy={p.y - r * 0.12}
                  r={r * (isMe || n.count > 20 ? 0.5 : 0.28)}
                  fill="#ffffff"
                  opacity={isMe || n.count > 20 ? 0.9 : 0.55}
                  filter="url(#soften)"
                />
                {showLabel && !isMe && (
                  <text
                    x={p.x}
                    y={p.y + r * 2.1 + 12}
                    textAnchor="middle"
                    fill="#e8f4f0"
                    fontSize="12"
                    fontWeight={selected === n.id ? 700 : 400}
                    style={{ paintOrder: "stroke", stroke: "#152638", strokeWidth: 3 }}
                  >
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* center label pill */}
          {mePos && (
            <g pointerEvents="none">
              <rect
                x={mePos.x - 26}
                y={mePos.y - 44}
                width="52"
                height="24"
                rx="5"
                fill="#0d1826"
                opacity="0.92"
              />
              <text
                x={mePos.x}
                y={mePos.y - 27}
                textAnchor="middle"
                fill="#f4f4f5"
                fontSize="13"
                fontFamily="var(--font-geist-mono), monospace"
              >
                Me
              </text>
            </g>
          )}
        </svg>

        {/* title card */}
        <div className="absolute left-4 top-4 rounded-xl bg-stone-100/95 px-4 py-3 shadow-lg">
          <h1 className="text-lg font-bold tracking-tight text-stone-900">My memory graph</h1>
          <p className="text-xs text-stone-500">
            {graph.nodes.length} nodes · {graph.edges.length} edges ·{" "}
            <span className="font-medium text-teal-700">live</span>
          </p>
        </div>

        {/* legend */}
        <div className="absolute bottom-4 left-4 hidden max-w-64 rounded-xl bg-stone-100/95 px-4 py-3 text-stone-700 shadow-lg sm:block">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Legend</p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {Object.entries(TYPE_LABEL).map(([type, label]) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[type] }} />
                {label}
              </span>
            ))}
          </div>
          <div className="mt-2 space-y-1 border-t border-stone-300 pt-2 text-[11px] leading-snug text-stone-600">
            <p>Each dot is a memory — bigger means it comes up more.</p>
            <p>Lines connect related memories. Tap a dot to explore.</p>
          </div>
        </div>

        {/* stats / focus panel */}
        <div className="absolute bottom-4 right-4 w-60 rounded-xl bg-stone-100/95 px-4 py-3 text-stone-700 shadow-lg">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold text-stone-900">
                  {nodes.find((n) => n.id === selected)?.label}
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded px-1 text-xs text-stone-400 hover:text-stone-700"
                  aria-label="Clear selection"
                >
                  ✕
                </button>
              </div>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                {selectedEdges.map((e, i) => (
                  <li key={i}>
                    {nodes.find((n) => n.id === e.source)?.label ?? e.source}{" "}
                    <span className="font-medium text-teal-700">{e.label}</span>{" "}
                    {nodes.find((n) => n.id === e.target)?.label ?? e.target}
                    {e.count > 1 && <span className="text-stone-400"> ×{e.count}</span>}
                  </li>
                ))}
                {selectedEdges.length === 0 && <li className="text-stone-400">No connections yet.</li>}
              </ul>
            </>
          ) : (
            <>
              <h2 className="font-bold text-stone-900">Your world</h2>
              <p className="text-[11px] text-stone-500">Grows live as you speak.</p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
                <span>
                  memories <span className="font-bold">{graph.nodes.length}</span>
                </span>
                <span>
                  links <span className="font-bold">{graph.edges.length}</span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-stone-300 pt-2 text-[11px]">
                {Object.entries(TYPE_LABEL).map(([type, label]) =>
                  typeCounts[type] ? (
                    <span key={type} className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[type] }} />
                      {label} <b>{typeCounts[type]}</b>
                    </span>
                  ) : null
                )}
              </div>
              <p className="mt-2 border-t border-stone-300 pt-2 text-[11px] text-stone-500">
                {`From ${graph.sentenceCount} sentences you've spoken.`}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
