import { useCallback, useEffect, useState } from "react";
import { FineResultList } from "../fines/FineResultList";
import { ui } from "../../components/ui/uiClasses";
import { estimateVTVMonth } from "./vtvEstimate";

// Sources queried in parallel for each vehicle
const FLEET_SOURCES = [
  { id: "caba",      label: "CABA" },
  { id: "pba",       label: "PBA" },
  { id: "cordoba",   label: "Córdoba" },
  { id: "santafe",   label: "Santa Fe" },
  { id: "mendoza",   label: "Mendoza" },
  { id: "entrerios", label: "Entre Ríos" },
];

function PlateBadge({ plate }) {
  return (
    <div className="plate-badge">
      <div className="plate-band" />
      <div className="plate-text text-[13px] px-3">{plate}</div>
      <div className="plate-band" />
    </div>
  );
}

function ProfileRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-edge last:border-0">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2 shrink-0">
        {label}
      </span>
      <span className="font-display text-xs font-bold uppercase tracking-wide text-ink-1 text-right">
        {value}
      </span>
    </div>
  );
}

function vtvColorClass(days) {
  if (days < 0)  return "text-danger border-danger/40 bg-danger/5";
  if (days < 30) return "text-danger border-danger/40 bg-danger/5";
  if (days < 90) return "text-amber-400 border-amber-400/40 bg-amber-400/5";
  return "text-success border-success/40 bg-success/5";
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

// ── Module panels ────────────────────────────────────────────────────────────

function DriverPanel({ plate, backendUrl, token }) {
  const [history, setHistory] = useState(undefined); // undefined=loading

  useEffect(() => {
    fetch(`${backendUrl}/v1/fleet/vehicles/${plate}/driver-history`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(p => setHistory(p.success ? (p.data ?? []) : [])).catch(() => setHistory([]));
  }, [plate, backendUrl, token]);

  if (history === undefined) return <p className="text-xs text-ink-3">Cargando...</p>;
  if (history.length === 0) return <p className="text-xs text-ink-3">Sin historial de conductores.</p>;

  const current = history.find(a => a.is_current);
  const past = history.filter(a => !a.is_current);

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-2">
      {current && (
        <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
          <p className="font-display text-sm font-bold uppercase tracking-wide text-brand">{current.driver_name}</p>
          <span className="font-display text-[9px] font-semibold uppercase tracking-widest text-brand/60 ml-auto">
            desde {fmtDate(current.assigned_at)}
          </span>
        </div>
      )}
      {past.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="font-display text-[9px] uppercase tracking-widest text-ink-3 mb-1">Historial</p>
          {past.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-layer-2 px-3 py-1.5">
              <span className="font-display text-xs font-semibold uppercase tracking-wide text-ink-2">{a.driver_name}</span>
              <span className="font-mono text-[10px] text-ink-3 shrink-0">
                {fmtDate(a.assigned_at)} → {fmtDate(a.unassigned_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenancePanel({ plate, backendUrl, token }) {
  const [records, setRecords] = useState(null);
  useEffect(() => {
    fetch(`${backendUrl}/v1/fleet/maintenance?plate=${plate}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(p => setRecords(p.success ? p.data : [])).catch(() => setRecords([]));
  }, [plate, backendUrl, token]);

  if (records === null) return <p className="text-xs text-ink-3">Cargando...</p>;
  if (records.length === 0) return <p className="text-xs text-ink-3">Sin registros de mantenimiento.</p>;

  const totalCost = records.reduce((s, r) => s + (r.cost_ars ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 mb-2">
        <div className="rounded-xl border border-edge bg-layer-2 px-3 py-2">
          <p className="font-display text-[9px] uppercase tracking-widest text-ink-3">Registros</p>
          <p className="font-display text-sm font-bold text-ink-1">{records.length}</p>
        </div>
        <div className="rounded-xl border border-edge bg-layer-2 px-3 py-2">
          <p className="font-display text-[9px] uppercase tracking-widest text-ink-3">Total ARS</p>
          <p className="font-display text-sm font-bold text-ink-1">${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
        </div>
      </div>
      {records.slice(0, 3).map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-edge bg-layer-2 px-3 py-2">
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-ink-1 truncate">{r.description || r.type}</p>
            <p className="font-mono text-[10px] text-ink-3">
              {r.service_date?.slice(0, 10)}
              {r.km_at_service ? ` · ${r.km_at_service.toLocaleString("es-AR")} km` : ""}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-xs font-semibold text-ink-1">${(r.cost_ars ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
            {r.next_service_date && (
              <p className="font-mono text-[10px] text-ink-3">Próx: {r.next_service_date.slice(0, 10)}</p>
            )}
          </div>
        </div>
      ))}
      {records.length > 3 && (
        <p className="font-display text-[10px] uppercase tracking-widest text-ink-3 text-center">+{records.length - 3} más — ver en Mantenimiento</p>
      )}
    </div>
  );
}

const DOC_LABELS = { vtv: "VTV", seguro: "Seguro", rto: "RTO", habilitacion: "Habilitación", licencia: "Licencia", otro: "Otro" };

function DocumentsPanel({ plate, backendUrl, token }) {
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    fetch(`${backendUrl}/v1/fleet/documents?plate=${plate}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(p => setDocs(p.success ? p.data : [])).catch(() => setDocs([]));
  }, [plate, backendUrl, token]);

  if (docs === null) return <p className="text-xs text-ink-3">Cargando...</p>;
  if (docs.length === 0) return <p className="text-xs text-ink-3">Sin documentos registrados.</p>;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {docs.map((d) => {
        const days = d.expires_at
          ? Math.round((new Date(d.expires_at.slice(0, 10) + "T00:00:00") - (() => { const t = new Date(); t.setHours(0,0,0,0); return t; })()) / 86400000)
          : null;
        return (
          <div key={d.id} className="flex items-center justify-between rounded-xl border border-edge bg-layer-2 px-3 py-2 gap-2">
            <span className="font-display text-[10px] font-bold uppercase tracking-widest text-ink-2">
              {DOC_LABELS[d.doc_type] ?? d.doc_type}
            </span>
            {days !== null ? (
              <span className={`rounded-full border px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide ${
                days < 0 ? "border-danger/40 bg-danger/5 text-danger" :
                days < 30 ? "border-warn/40 bg-warn/5 text-warn" :
                "border-ok/40 bg-ok/5 text-ok"
              }`}>
                {days < 0 ? "Vencido" : days < 30 ? `${days}d` : d.expires_at.slice(0, 10)}
              </span>
            ) : (
              <span className="font-display text-[9px] text-ink-3">Sin fecha</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FuelPanel({ plate, backendUrl, token }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    fetch(`${backendUrl}/v1/fleet/fuel?plate=${plate}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(p => setLogs(p.success ? p.data : [])).catch(() => setLogs([]));
  }, [plate, backendUrl, token]);

  if (logs === null) return <p className="text-xs text-ink-3">Cargando...</p>;
  if (logs.length === 0) return <p className="text-xs text-ink-3">Sin registros de combustible.</p>;

  const sorted = [...logs].sort((a, b) => new Date(a.fill_date) - new Date(b.fill_date));
  let avgKmL = null;
  if (sorted.length >= 2) {
    let km = 0, liters = 0;
    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i].km_at_fill - sorted[i - 1].km_at_fill;
      if (d > 0) { km += d; liters += sorted[i].liters; }
    }
    if (liters > 0) avgKmL = (km / liters).toFixed(2);
  }
  const totalCost = logs.reduce((s, l) => s + (l.total_cost_ars ?? 0), 0);
  const recent = [...logs].sort((a, b) => new Date(b.fill_date) - new Date(a.fill_date)).slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-edge bg-layer-2 px-3 py-2">
          <p className="font-display text-[9px] uppercase tracking-widest text-ink-3">Cargas</p>
          <p className="font-display text-sm font-bold text-ink-1">{logs.length}</p>
        </div>
        <div className="rounded-xl border border-edge bg-layer-2 px-3 py-2">
          <p className="font-display text-[9px] uppercase tracking-widest text-ink-3">Total ARS</p>
          <p className="font-display text-sm font-bold text-ink-1">${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
        </div>
        {avgKmL && (
          <div className="rounded-xl border border-edge bg-layer-2 px-3 py-2">
            <p className="font-display text-[9px] uppercase tracking-widest text-ink-3">Promedio</p>
            <p className="font-display text-sm font-bold text-ink-1">{avgKmL} km/L</p>
          </div>
        )}
      </div>
      <div className="space-y-1">
        {recent.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-xl border border-edge bg-layer-2 px-3 py-2 text-xs gap-3">
            <span className="font-mono text-ink-2">{l.fill_date?.slice(0, 10)} · {(l.liters ?? 0).toLocaleString("es-AR")}L · {l.fuel_type}</span>
            <span className="font-mono font-semibold text-ink-1 shrink-0">${(l.total_cost_ars ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 0 })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fines section with aggregate summary ─────────────────────────────────────
function FinesSection({ plate, backendUrl, token }) {
  const [results, setResults] = useState({}); // { [sourceId]: { total, amount, fetched } }

  const onResult = useCallback((sourceId, total, amount) => {
    setResults(r => ({ ...r, [sourceId]: { total, amount, fetched: true } }));
  }, []);

  const fetchedSources = Object.values(results).filter(r => r.fetched);
  const totalFines  = fetchedSources.reduce((s, r) => s + r.total, 0);
  const totalAmount = fetchedSources.reduce((s, r) => s + r.amount, 0);
  const hasAny      = totalFines > 0;

  return (
    <div className={ui.panel}>
      {/* Panel header + aggregate summary */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-2">
          Multas por distrito
        </p>
        {fetchedSources.length > 0 && (
          <div className="flex items-center gap-2">
            <span className={[
              "rounded-full border px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest",
              hasAny ? "border-danger/25 bg-danger/5 text-danger" : "border-edge-hi bg-layer-2 text-ink-3",
            ].join(" ")}>
              {totalFines} multa{totalFines !== 1 ? "s" : ""} · {fetchedSources.length}/{FLEET_SOURCES.length} fuentes
            </span>
            {hasAny && totalAmount > 0 && (
              <span className="rounded-full border border-danger/25 bg-danger/5 px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-danger">
                ARS {totalAmount.toLocaleString("es-AR")}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {FLEET_SOURCES.map((s) => (
          <SourceFinesPanel
            key={s.id}
            sourceId={s.id}
            label={s.label}
            plate={plate}
            backendUrl={backendUrl}
            token={token}
            onResult={onResult}
          />
        ))}
      </div>
    </div>
  );
}

// ── Per-source fines panel ───────────────────────────────────────────────────
function SourceFinesPanel({ sourceId, label, plate, backendUrl, token, onResult }) {
  const [fines, setFines]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [fetched, setFetched]       = useState(false);
  const [cached, setCached]         = useState(false);
  const [fetchedAt, setFetchedAt]   = useState(null);
  const [expanded, setExpanded]     = useState(false); // opens after fetch if has fines

  async function fetch_(force = false) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ source: sourceId });
      if (force) params.set("force", "true");
      const res = await fetch(`${backendUrl}/v1/fleet/vehicles/${plate}/fines?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok || payload.success === false)
        throw new Error(payload?.error?.message || `Error ${res.status}`);
      const d = payload.data ?? {};
      const f = d.fines ?? [];
      setFines(f);
      setTotal(d.total ?? 0);
      setCached(d.cached ?? false);
      setFetchedAt(d.fetched_at ? new Date(d.fetched_at) : new Date());
      if (f.length > 0) setExpanded(true);
      const amt = f.reduce((s, fi) => s + Number(fi.amount || 0), 0);
      onResult?.(sourceId, d.total ?? 0, amt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  useEffect(() => { fetch_(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalAmount = fines.reduce((s, f) => s + Number(f.amount || 0), 0);
  const currency    = fines[0]?.currency ?? "ARS";

  return (
    <div className="rounded-2xl border border-edge bg-layer-1 overflow-hidden">
      {/* ── Header row ── */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-layer-2 transition-colors"
        onClick={() => fetched && setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {/* chevron */}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`text-ink-3 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M9 18l6-6-6-6"/>
          </svg>

          <span className="font-display text-xs font-bold uppercase tracking-widest text-ink-1">
            {label}
          </span>

          {fetched && (
            <span className={[
              "rounded-full border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest",
              total > 0
                ? "border-danger/25 bg-danger/5 text-danger"
                : "border-edge-hi bg-layer-2 text-ink-3",
            ].join(" ")}>
              {loading ? "…" : `${total} multa${total !== 1 ? "s" : ""}`}
            </span>
          )}

          {fetched && totalAmount > 0 && (
            <span className="rounded-full border border-danger/25 bg-danger/5 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-danger">
              {currency} {totalAmount.toLocaleString("es-AR")}
            </span>
          )}

          {loading && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand pulse-dot" />
              <span className="font-display text-[10px] uppercase tracking-wider text-brand">Consultando</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {fetched && fetchedAt && (
            <span className="hidden sm:block rounded-full border border-edge-hi bg-layer-2 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-ink-3">
              {cached
                ? `caché · ${fetchedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
                : "ahora"}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); fetch_(true); }}
            disabled={loading}
            className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-2 transition-all hover:border-brand/40 hover:text-brand disabled:opacity-40"
          >
            {loading ? "..." : "↺"}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {expanded && (
        <div className="border-t border-edge px-4 py-4">
          <FineResultList
            fines={fines}
            isLoading={loading}
            error={error}
            hasSearched={fetched}
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function VehicleDetailPage({
  plate,
  profile,
  backendUrl,
  token,
  onBack,
  onLookupProfile,
  profileLoading,
  vtvDueDate,
  onUpdateVTV,
  enabledModules = [],
}) {
  const [localVTV, setLocalVTV]   = useState(vtvDueDate ?? null);
  const [vtvEditing, setVtvEditing] = useState(false);
  const [vtvInput, setVtvInput]   = useState(vtvDueDate ?? "");
  const [vtvSaving, setVtvSaving] = useState(false);
  const [vtvError, setVtvError]   = useState("");

  const data     = profile?.data;
  const estimate = !localVTV ? estimateVTVMonth(plate) : null;
  const vtvDays  = localVTV ? daysUntil(localVTV) : null;
  const vtvColor = localVTV ? vtvColorClass(vtvDays) : "";

  async function saveVTV() {
    setVtvSaving(true); setVtvError("");
    try {
      const body = vtvInput ? { vtv_due_date: vtvInput } : { vtv_due_date: null };
      const res = await fetch(`${backendUrl}/v1/fleet/vehicles/${plate}/vtv`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || payload.success === false)
        throw new Error(payload?.error?.message || `Error ${res.status}`);
      const newDate = vtvInput || null;
      setLocalVTV(newDate);
      setVtvEditing(false);
      onUpdateVTV?.(newDate);
    } catch (err) {
      setVtvError(err.message);
    } finally {
      setVtvSaving(false);
    }
  }

  return (
    <div className="fade-up space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Mi Flota
        </button>
        <div className="flex items-center gap-3">
          <PlateBadge plate={plate} />
          {data?.make && (
            <div>
              <p className="font-display text-lg font-black uppercase tracking-wide text-ink-1 leading-none">
                {data.make} {data.model || ""}
              </p>
              {data.year > 0 && <p className="font-mono text-xs text-ink-2">{data.year}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Top cards row ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Perfil */}
        <div className={ui.panel}>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-2">
              Perfil del vehículo
            </p>
            <button
              type="button"
              onClick={onLookupProfile}
              disabled={profileLoading}
              className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-2 transition-all hover:border-brand/40 hover:text-brand disabled:opacity-50"
            >
              {profileLoading ? "Consultando..." : "Actualizar"}
            </button>
          </div>
          {data ? (
            <div>
              <ProfileRow label="Marca"        value={data.make} />
              <ProfileRow label="Modelo"       value={data.model} />
              <ProfileRow label="Año"          value={data.year > 0 ? String(data.year) : null} />
              <ProfileRow label="Tipo"         value={data.type} />
              <ProfileRow label="Combustible"  value={data.fuel} />
              {data.source && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full border border-edge-hi px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-ink-3">
                    Fuente: {data.source}
                  </span>
                  {data.confidence && (
                    <span className="rounded-full border border-edge-hi px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-ink-3">
                      {data.confidence}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : profile?.error ? (
            <p className="text-sm text-danger">{profile.error}</p>
          ) : (
            <div className="py-6 text-center">
              <p className="font-display text-sm uppercase tracking-wider text-ink-3">Sin datos</p>
              <button
                type="button"
                onClick={onLookupProfile}
                disabled={profileLoading}
                className="mt-3 rounded-xl bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030]"
              >
                {profileLoading ? "Consultando..." : "Consultar perfil"}
              </button>
            </div>
          )}
        </div>

        {/* VTV */}
        <div className={ui.panel}>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-2">VTV</p>
            <div className="flex items-center gap-2">
              <a
                href="https://www.rtoba.gba.gob.ar/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-2 transition-all hover:border-brand/40 hover:text-brand"
                title="Verificar en portal oficial RTOBA (PBA)"
              >
                RTOBA ↗
              </a>
              {localVTV && !vtvEditing && (
                <button
                  type="button"
                  onClick={() => { setVtvInput(localVTV); setVtvEditing(true); setVtvError(""); }}
                  className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
                >
                  Editar
                </button>
              )}
            </div>
          </div>

          {vtvEditing ? (
            <div className="space-y-3">
              <label className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2">
                Fecha de vencimiento
              </label>
              <input
                type="date"
                value={vtvInput}
                onChange={(e) => setVtvInput(e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-sm text-ink-1 outline-none focus:border-brand"
              />
              {vtvError && <p className="font-display text-[10px] uppercase tracking-wider text-danger">{vtvError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={saveVTV} disabled={vtvSaving}
                  className="flex-1 rounded-xl bg-brand px-3 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030] disabled:opacity-50">
                  {vtvSaving ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" onClick={() => { setVtvEditing(false); setVtvError(""); }} disabled={vtvSaving}
                  className="rounded-xl border border-edge px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1 disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          ) : localVTV ? (
            <div className={`rounded-xl border px-4 py-3 ${vtvColor}`}>
              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] opacity-70">Vence</p>
              <p className="font-display text-lg font-black uppercase tracking-wide leading-tight">
                {new Date(localVTV + "T00:00:00").toLocaleDateString("es-AR", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
              <p className="font-mono text-[10px] mt-1 opacity-80">
                {vtvDays < 0
                  ? `Vencida hace ${Math.abs(vtvDays)} día${Math.abs(vtvDays) !== 1 ? "s" : ""}`
                  : vtvDays === 0 ? "Vence hoy"
                  : `${vtvDays} día${vtvDays !== 1 ? "s" : ""} restante${vtvDays !== 1 ? "s" : ""}`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {estimate && (
                <div className="rounded-xl border border-edge-hi bg-layer-2 px-4 py-3">
                  <p className="font-display text-[9px] font-semibold uppercase tracking-[0.15em] text-ink-3">Estimado (rotación PBA)</p>
                  <p className="font-display text-base font-bold uppercase tracking-wide text-ink-2 mt-1">
                    {estimate.month} {estimate.year}
                  </p>
                  <p className="font-mono text-[9px] text-ink-3 mt-1">Basado en terminal de patente · No definitivo</p>
                </div>
              )}
              {/* Link a verificación oficial */}
              <a
                href="https://www.rtoba.gba.gob.ar/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full rounded-xl border border-edge-hi bg-layer-2 px-4 py-3 text-left transition-all hover:border-brand/40 group"
              >
                <div>
                  <p className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2 group-hover:text-brand transition-colors">
                    Verificar VTV oficial
                  </p>
                  <p className="font-mono text-[9px] text-ink-3 mt-0.5">
                    rtoba.gba.gob.ar · PBA
                  </p>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3 group-hover:text-brand transition-colors shrink-0">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
              <button type="button"
                onClick={() => { setVtvInput(""); setVtvEditing(true); setVtvError(""); }}
                className="w-full rounded-xl border border-edge px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-brand/40 hover:text-brand">
                + Cargar fecha de vencimiento
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Multas por distrito ── */}
      <FinesSection plate={plate} backendUrl={backendUrl} token={token} />

      {/* ── Módulos del vehículo ── */}
      {(enabledModules.includes("conductores") ||
        enabledModules.includes("mantenimiento") ||
        enabledModules.includes("documentos") ||
        enabledModules.includes("combustible")) && (
        <div className={ui.panel}>
          <p className="mb-5 font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-2">
            Módulos del vehículo
          </p>
          <div className="space-y-6">
            {enabledModules.includes("conductores") && (
              <div>
                <p className="mb-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">Conductores</p>
                <DriverPanel plate={plate} backendUrl={backendUrl} token={token} />
              </div>
            )}
            {enabledModules.includes("mantenimiento") && (
              <div>
                <p className="mb-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">Mantenimiento</p>
                <MaintenancePanel plate={plate} backendUrl={backendUrl} token={token} />
              </div>
            )}
            {enabledModules.includes("documentos") && (
              <div>
                <p className="mb-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">Documentos</p>
                <DocumentsPanel plate={plate} backendUrl={backendUrl} token={token} />
              </div>
            )}
            {enabledModules.includes("combustible") && (
              <div>
                <p className="mb-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">Combustible</p>
                <FuelPanel plate={plate} backendUrl={backendUrl} token={token} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
