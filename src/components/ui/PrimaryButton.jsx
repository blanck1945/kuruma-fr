export function PrimaryButton({ children, onClick, disabled, loading, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "relative w-full overflow-hidden rounded-xl px-4 py-2.5",
        "font-display text-sm font-semibold uppercase tracking-widest",
        "transition-all duration-150",
        "bg-brand text-base hover:bg-[#F5A030]",
        "focus:outline-none focus:ring-2 focus:ring-brand/40",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "active:scale-[0.98]",
      ].join(" ")}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-base" />
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-base" style={{ animationDelay: "0.2s" }} />
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-base" style={{ animationDelay: "0.4s" }} />
        </span>
      ) : children}
    </button>
  );
}
