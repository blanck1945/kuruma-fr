import { ui } from "./uiClasses";

export function FormField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  error,
  autoComplete,
}) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className={ui.label}>
          {label}
        </label>
      )}
      <input
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
        className={[
          ui.input,
          error ? "border-danger/60 focus:border-danger focus:ring-danger/20" : "",
        ].join(" ")}
        aria-invalid={Boolean(error)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className={ui.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
