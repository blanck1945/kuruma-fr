import { useState } from "react";
import PropTypes from "prop-types";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { FormField } from "../../components/ui/FormField";

export default function LoginPage({ backendUrl, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/v1/public/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || "Credenciales inválidas");
      }
      onLogin(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left hero panel ── */}
      <div
        className="relative hidden lg:flex lg:w-[45%] flex-col justify-between overflow-hidden p-12"
        style={{ background: "linear-gradient(160deg, #0C0800 0%, #150F00 50%, #0A0700 100%)" }}
      >
        {/* Grid texture */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(232,147,26,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,147,26,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Amber radial glow */}
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: "-80px",
            left: "-80px",
            width: "480px",
            height: "480px",
            background: "radial-gradient(circle, rgba(232,147,26,0.18) 0%, transparent 68%)",
          }}
        />

        {/* Top label */}
        <div className="relative">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">
            Sistema de gestión vehicular
          </span>
        </div>

        {/* Hero text */}
        <div className="relative">
          <h1
            className="font-display font-black uppercase leading-[0.88] tracking-tight text-ink-1"
            style={{ fontSize: "clamp(64px, 9vw, 100px)" }}
          >
            KURU
            <br />
            <span className="text-brand">MA</span>
          </h1>
          <p className="mt-6 font-display text-lg font-medium uppercase tracking-[0.08em] text-ink-2">
            Multas · Perfiles · Flotas
            <br />
            en tiempo real
          </p>

          <div className="mt-8 flex items-center gap-3">
            {["CABA", "PBA", "CBA", "ER", "+22"].map((label) => (
              <span
                key={label}
                className="rounded border border-edge-hi px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom rule */}
        <div className="relative flex items-center gap-4">
          <div className="h-px flex-1 bg-edge" />
          <span className="font-display text-[10px] uppercase tracking-[0.25em] text-ink-3">Argentina · 2025</span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-base px-8 py-16 fade-up">
        {/* Mobile wordmark */}
        <div className="mb-10 lg:hidden">
          <p className="font-display text-3xl font-black uppercase tracking-widest text-brand">Kuruma</p>
        </div>

        <div className="w-full max-w-[360px]">
          <div className="mb-1 h-px w-8 bg-brand" />
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-ink-1">
            Iniciar sesión
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            Ingresá con los datos de tu organización.
          </p>


          <form onSubmit={handleSubmit} className="mt-4 space-y-5">
            <FormField
              id="login-email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@flota.com"
              autoComplete="email"
            />
            <FormField
              id="login-password"
              label="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
            />

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                <span className="mt-px text-xs font-bold text-danger">✕</span>
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            <PrimaryButton type="submit" disabled={loading || !email || !password} loading={loading}>
              Entrar
            </PrimaryButton>
          </form>

        </div>
      </div>
    </div>
  );
}

LoginPage.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  onLogin: PropTypes.func.isRequired,
};
