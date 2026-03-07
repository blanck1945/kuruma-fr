const variants = {
  error:   "border-danger/20   bg-danger/5   text-danger",
  success: "border-success/20  bg-success/5  text-success",
  warning: "border-warn/20     bg-warn/5     text-warn",
};

const icons = {
  error:   "✕",
  success: "✓",
  warning: "⚠",
};

export function StatusBanner({ variant = "error", children }) {
  return (
    <div
      className={`mb-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${variants[variant] ?? variants.error}`}
      role="status"
      aria-live="polite"
    >
      <span className="font-display mt-px text-base font-bold leading-none">{icons[variant]}</span>
      <span className="font-sans">{children}</span>
    </div>
  );
}
