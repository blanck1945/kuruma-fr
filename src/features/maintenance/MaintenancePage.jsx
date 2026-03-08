import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AIExcelImport, { runMockImport } from "../../components/AIExcelImport";

const IMPORT_COLS = [
  { key: "plate",            label: "Patente" },
  { key: "type",             label: "Tipo" },
  { key: "description",      label: "Descripción" },
  { key: "service_date",     label: "Fecha" },
  { key: "km_at_service",    label: "KM" },
  { key: "cost_ars",         label: "Costo $" },
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00");
  return Math.round((d - today) / 86400000);
}

function ServiceBadge({ nextDate }) {
  if (!nextDate) return <span className="text-[10px] text-ink-3 font-mono">—</span>;
  const days = daysUntil(nextDate);
  const label = nextDate.slice(0, 10);
  if (days < 0) return <span className="rounded-full border border-danger/40 bg-danger/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-danger">Vencido · {label}</span>;
  if (days < 30) return <span className="rounded-full border border-warn/40 bg-warn/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-warn">Pronto · {label}</span>;
  return <span className="rounded-full border border-ok/40 bg-ok/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-ok">OK · {label}</span>;
}

const EMPTY_FORM = {
  plate: "", type: "preventive", description: "", service_date: "", km_at_service: "",
  next_service_date: "", next_service_km: "", cost_ars: "", notes: "",
};

export default function MaintenancePage({ backendUrl, apiKey, token, savedPlates }) {
  const qc = useQueryClient();
  const [filterPlate, setFilterPlate] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [testBusy, setTestBusy] = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const { data: allRecords = [], isLoading } = useQuery({
    queryKey: ["maintenance", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/maintenance`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const records = useMemo(
    () => filterPlate ? allRecords.filter(r => r.plate === filterPlate) : allRecords,
    [allRecords, filterPlate]
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["maintenance", token] });

  async function handleSave(e) {
    e.preventDefault();
    if (!form.plate || !form.service_date) { setError("Patente y fecha de service son obligatorios"); return; }
    setSaving(true); setError("");
    try {
      const body = {
        plate: form.plate,
        type: form.type,
        description: form.description,
        service_date: form.service_date,
        km_at_service: Number(form.km_at_service) || 0,
        next_service_date: form.next_service_date || null,
        next_service_km: form.next_service_km ? Number(form.next_service_km) : null,
        cost_ars: Number(form.cost_ars) || 0,
        notes: form.notes,
      };
      const res = await fetch(`${backendUrl}/v1/fleet/maintenance`, { method: "POST", headers, body: JSON.stringify(body) });
      const p = await res.json();
      if (!res.ok || !p.success) throw new Error(p?.error?.message || "Error al guardar");
      setShowForm(false);
      setForm(EMPTY_FORM);
      invalidate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearAll() {
    if (!confirm("¿Eliminar TODOS los registros de mantenimiento? Esta acción no se puede deshacer.")) return;
    try {
      await fetch(`${backendUrl}/v1/fleet/maintenance`, { method: "DELETE", headers });
      invalidate();
    } catch { /* ignore */ }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    try {
      await fetch(`${backendUrl}/v1/fleet/maintenance/${id}`, { method: "DELETE", headers });
      invalidate();
    } catch { /* ignore */ }
  }

  async function handleImport(rows) {
    if (!rows.length) return;
    setImportMsg("");
    let ok = 0;
    for (const row of rows) {
      try {
        const body = {
          plate: String(row.plate).toUpperCase(),
          type: row.type || "preventive",
          description: row.description || "",
          service_date: row.service_date,
          km_at_service: Number(row.km_at_service) || 0,
          next_service_date: row.next_service_date || null,
          next_service_km: row.next_service_km ? Number(row.next_service_km) : null,
          cost_ars: Number(row.cost_ars) || 0,
          notes: row.notes || "",
        };
        const res = await fetch(`${backendUrl}/v1/fleet/maintenance`, { method: "POST", headers, body: JSON.stringify(body) });
        if (res.ok) ok++;
      } catch { /* ignore */ }
    }
    setImportMsg(`${ok} de ${rows.length} registros importados`);
    invalidate();
  }

  async function handleTestClick() {
    setTestBusy(true); setImportMsg(""); setShowImport(true);
    try {
      const rows = await runMockImport(backendUrl, apiKey, "/v1/external/parse-maintenance-csv", "/mocks/mantenimiento.xlsx", (r) => Boolean(r?.plate && r?.service_date));
      await handleImport(rows);
    } catch (err) {
      setImportMsg(err.message);
    } finally { setTestBusy(false); }
  }

  const totalCost = records.reduce((s, r) => s + (r.cost_ars ?? 0), 0);

  return (
    <div className="space-y-5 fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink-1">Mantenimiento</h2>
          <p className="text-sm text-ink-2">{records.length} registro{records.length !== 1 ? "s" : ""} · Total: ${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setShowImport((v) => !v); setImportMsg(""); }}
            className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-brand transition-all hover:bg-brand/20"
          >
            CSV / Excel
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(true); setError(""); }}
            className="rounded-xl bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030]"
          >
            + Agregar
          </button>
        </div>
      </div>

      {showImport && (
        <div>
          <AIExcelImport
            backendUrl={backendUrl}
            apiKey={apiKey}
            endpoint="/v1/external/parse-maintenance-csv"
            columns={IMPORT_COLS}
            validate={(r) => Boolean(r?.plate && r?.service_date)}
            onImport={handleImport}
            mockFile="/mocks/mantenimiento.xlsx"
          />
          {importMsg && <p className="mt-2 text-xs text-ok font-display uppercase tracking-wider">{importMsg}</p>}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">Filtrar patente</label>
        <select
          value={filterPlate}
          onChange={(e) => setFilterPlate(e.target.value)}
          className="rounded-xl border border-edge bg-layer-2 px-3 py-1.5 font-mono text-xs text-ink-1 outline-none focus:border-brand"
        >
          <option value="">Todas</option>
          {savedPlates.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-brand/30 bg-layer-1 p-5">
          <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-widest text-ink-1">Nuevo registro</h3>
          <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Patente *</label>
              <select
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
              >
                <option value="">Seleccionar</option>
                {savedPlates.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
              >
                <option value="preventive">Preventivo</option>
                <option value="corrective">Correctivo</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Descripción</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
              />
            </div>
            {[
              { id: "service_date", label: "Fecha de service *", type: "date" },
              { id: "km_at_service", label: "Km al service", type: "number" },
              { id: "next_service_date", label: "Próximo service (fecha)", type: "date" },
              { id: "next_service_km", label: "Próximo service (km)", type: "number" },
              { id: "cost_ars", label: "Costo ARS", type: "number" },
            ].map(({ id, label, type }) => (
              <div key={id}>
                <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">{label}</label>
                <input
                  type={type}
                  value={form[id]}
                  onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
                  className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Notas</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
              />
            </div>
            {error && <p className="sm:col-span-2 text-xs text-danger">{error}</p>}
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" disabled={saving} className="rounded-xl bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-edge px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-ink-3">Cargando...</p>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-layer-1 py-16 text-center">
          <p className="font-display text-lg font-bold uppercase tracking-wider text-ink-3">Sin registros</p>
          <p className="mt-2 text-sm text-ink-3">Agregá el primer registro de mantenimiento.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-edge bg-layer-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-edge">
                {["Patente", "Tipo", "Descripción", "Fecha", "Km", "Costo ARS", "Próximo service", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-edge/50 hover:bg-layer-2">
                  <td className="px-4 py-3 font-display font-bold text-ink-1">{r.plate}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide ${r.type === "corrective" ? "border-danger/30 text-danger" : "border-brand/30 text-brand"}`}>
                      {r.type === "corrective" ? "Correctivo" : "Preventivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-2 max-w-[200px] truncate">{r.description}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{r.service_date?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{r.km_at_service?.toLocaleString("es-AR") ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-ink-1">${(r.cost_ars ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3"><ServiceBadge nextDate={r.next_service_date} /></td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 hover:border-danger/40 hover:text-danger"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

MaintenancePage.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  apiKey: PropTypes.string,
  token: PropTypes.string,
  savedPlates: PropTypes.arrayOf(PropTypes.string),
};
