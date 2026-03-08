export function PrimaryButton({ children, onClick, disabled, loading, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "relative w-full overflow-hidden rounded-xl px-4 py-2.5 min-h-[42px]",
        "font-display text-sm font-semibold uppercase tracking-widest",
        "transition-all duration-150",
        "bg-brand text-base hover:bg-[#F5A030]",
        "focus:outline-none focus:ring-2 focus:ring-brand/40",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "active:scale-[0.98]",
        "flex items-center justify-center gap-2",
      ].join(" ")}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
