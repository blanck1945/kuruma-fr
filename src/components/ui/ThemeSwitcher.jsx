import { useState } from "react";
import { themes } from "../../themes";

export function ThemeSwitcher({ currentTheme, onThemeChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">

      {/* Panel */}
      {open && (
        <div className="rounded-2xl border border-edge-hi bg-layer-1 p-3 shadow-2xl shadow-black/80 w-56 max-h-[70vh] overflow-y-auto">
          <p className="mb-2.5 px-1 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-3">
            Tema de color
          </p>
          <div className="space-y-0.5">
            {Object.entries(themes).map(([id, theme]) => {
              const active = currentTheme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { onThemeChange(id); setOpen(false); }}
                  className={[
                    "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 transition-all text-left",
                    active
                      ? "bg-brand/10 border border-brand/30"
                      : "border border-transparent hover:bg-layer-2",
                  ].join(" ")}
                >
                  {/* Swatch strip */}
                  <div className="flex shrink-0 overflow-hidden rounded-md" style={{ width: 36, height: 16 }}>
                    <div className="flex-1" style={{ background: theme.vars["--color-base"] }} />
                    <div className="flex-1" style={{ background: theme.vars["--color-brand"] }} />
                    <div className="flex-1" style={{ background: theme.vars["--color-ink-1"] }} />
                  </div>
                  <span className={[
                    "font-display text-[10px] font-semibold uppercase tracking-widest flex-1 truncate",
                    active ? "text-brand" : "text-ink-1",
                  ].join(" ")}>
                    {theme.name}
                  </span>
                  {active && <span className="font-mono text-[9px] text-brand shrink-0">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Toggle pill */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-lg transition-all",
          open
            ? "border-brand/50 bg-brand/10 text-brand"
            : "border-edge bg-layer-1 text-ink-2 hover:border-brand/40 hover:text-brand",
        ].join(" ")}
      >
        <span className="text-sm leading-none">🎨</span>
        <span className="font-mono text-[10px] uppercase tracking-widest">{themes[currentTheme]?.name ?? "Tema"}</span>
      </button>
    </div>
  );
}
