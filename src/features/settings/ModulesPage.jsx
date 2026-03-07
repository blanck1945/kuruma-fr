import { useState } from "react";
import PropTypes from "prop-types";

const MODULES = [
  {
    id: "conductores",
    label: "Conductores",
    description: "Gestioná tu equipo de conductores: licencias, vencimientos, asignaciones a vehículos.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    id: "mantenimiento",
    label: "Mantenimiento",
    description: "Registrá services, revisiones y reparaciones. Alertas de próximo service por km o fecha.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  {
    id: "documentos",
    label: "Documentos",
    description: "Controlá VTV, seguros, RTO y habilitaciones. Alertas de vencimiento a 30 días.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    id: "combustible",
    label: "Combustible",
    description: "Registrá cargas de combustible, calculá consumo por km y controlá costos de flota.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="22" x2="15" y2="22"/>
        <line x1="4" y1="9" x2="14" y2="9"/>
        <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/>
        <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>
      </svg>
    ),
  },
  {
    id: "horario",
    label: "Horario",
    description: "Programá qué conductor tiene cada vehículo por día y horario. Vista semanal interactiva.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="14" x2="8" y2="14" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="12" y1="14" x2="12" y2="14" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="16" y1="14" x2="16" y2="14" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="8" y1="18" x2="8" y2="18" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="12" y1="18" x2="12" y2="18" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function ModulesPage({ backendUrl, token, enabledModules, onModulesUpdate }) {
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");

  async function toggleModule(moduleId) {
    const current = enabledModules ?? [];
    const next = current.includes(moduleId)
      ? current.filter((m) => m !== moduleId)
      : [...current, moduleId];

    setSaving(moduleId);
    setError("");
    try {
      const res = await fetch(`${backendUrl}/v1/fleet/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled_modules: next }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload?.error?.message || "Error al guardar");
      onModulesUpdate(payload.data.enabled_modules);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 fade-up">
      <div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink-1">
          Configuración de módulos
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Activá solo los módulos que tu organización necesita. Los tabs aparecen y desaparecen instantáneamente.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map(({ id, label, description, icon }) => {
          const active = (enabledModules ?? []).includes(id);
          const loading = saving === id;
          return (
            <div
              key={id}
              className={[
                "rounded-2xl border p-5 transition-all duration-200",
                active
                  ? "border-brand/40 bg-brand/5"
                  : "border-edge bg-layer-1 hover:border-edge-hi",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={active ? "text-brand" : "text-ink-3"}>
                    {icon}
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-1">
                      {label}
                    </p>
                    <p className="mt-1 text-xs text-ink-2 leading-relaxed">{description}</p>
                  </div>
                </div>

                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => toggleModule(id)}
                  disabled={loading}
                  aria-label={active ? `Desactivar ${label}` : `Activar ${label}`}
                  className={[
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                    "transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50",
                    active ? "bg-brand" : "bg-layer-3",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow",
                      "transition duration-200 ease-in-out",
                      active ? "translate-x-5" : "translate-x-0",
                    ].join(" ")}
                  />
                </button>
              </div>

              {active && (
                <div className="mt-4 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand pulse-dot" />
                  <span className="font-display text-[10px] uppercase tracking-widest text-brand">
                    Activo
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-edge bg-layer-1 p-5">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-ink-3">
          Módulos activos
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {(enabledModules ?? []).length === 0
            ? "Ninguno — la app funciona en modo básico."
            : (enabledModules ?? []).join(", ")}
        </p>
      </div>
    </div>
  );
}

ModulesPage.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  token: PropTypes.string,
  enabledModules: PropTypes.arrayOf(PropTypes.string),
  onModulesUpdate: PropTypes.func.isRequired,
};
