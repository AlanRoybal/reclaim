/** Small shared UI primitives: spinner, equalizer mark, buttons. */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** The Reclaim voice mark — five bars. Add `live` while audio is playing. */
export function EqMark({ live = false, className = "h-4" }: { live?: boolean; className?: string }) {
  return (
    <span className={`${live ? "eq-live" : ""} inline-flex items-end gap-[2px] ${className}`} aria-hidden>
      {[0.55, 0.85, 1, 0.7, 0.45].map((h, i) => (
        <span
          key={i}
          className="eq-bar w-[3px] rounded-full bg-amber-500"
          style={{ height: `${h * 100}%` }}
        />
      ))}
    </span>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-400 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500",
};

export const card = "rounded-xl border border-stone-800 bg-stone-900/60 p-5";
