export const ui = {
  panel: "rounded-2xl border border-edge bg-layer-1 p-5 shadow-2xl shadow-black/60",
  card:  "rounded-xl border border-edge bg-layer-2 p-4",
  input: [
    "w-full rounded-xl border border-edge bg-layer-1",
    "px-4 py-2.5 text-ink-1 font-sans text-sm",
    "outline-none transition-all duration-150",
    "placeholder:text-ink-3",
    "focus:border-brand focus:ring-2 focus:ring-brand/20",
  ].join(" "),
  label: "mb-1.5 block text-[11px] font-semibold font-display uppercase tracking-[0.15em] text-ink-2",
  hint:  "mt-1.5 text-xs text-ink-3",
};
