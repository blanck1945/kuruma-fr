import { ui } from "./uiClasses";

export function InfoCard({ title, children, meta }) {
  return (
    <article className={ui.card}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-1">{title}</h3>
        {meta ? <span className="font-display text-xs uppercase tracking-wider text-ink-2">{meta}</span> : null}
      </div>
      {children}
    </article>
  );
}
