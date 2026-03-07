import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import AIExcelImport, { runMockImport } from "../../components/AIExcelImport";

const IMPORT_COLS = [
  { key: "plate",         label: "Patente" },
  { key: "fill_date",     label: "Fecha" },
  { key: "liters",        label: "Litros" },
  { key: "km_at_fill",    label: "KM" },
  { key: "cost_per_liter",label: "$/Litro" },
  { key: "total_cost_ars",label: "Total $" },
  { key: "fuel_type",     label: "Tipo" },
];

const FUEL_TYPES = ["nafta", "diesel", "premium", "gnc"];
const FUEL_LABELS = { nafta: "Nafta", diesel: "Diesel", premium: "Premium", gnc: "GNC" };

const EMPTY_FORM = {
  plate: "", fill_date: "", liters: "", km_at_fill: "", cost_per_liter: "", total_cost_ars: "", fuel_type: "nafta", notes: "",
};

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-edge bg-layer-1 p-4">
      <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">{label}</p>
      <p className="mt-1 font-display text-lg font-bold text-ink-1">{value}</p>
    </div>
  );
}

export default function FuelPage({ backendUrl, apiKey, token, savedPlates }) {
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

  const { data: allLogs = [], isLoading } = useQuery({
    queryKey: ["fuel", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/fuel`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const logs = useMemo(
    () => filterPlate ? allLogs.filter(l => l.plate === filterPlate) : allLogs,
    [allLogs, filterPlate]
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["fuel", token] });

  // Auto-calculate total when liters/price changes
  function handleFormChange(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "liters" || field === "cost_per_liter") {
        const liters = parseFloat(field === "liters" ? value : next.liters) || 0;
        const price = parseFloat(field === "cost_per_liter" ? value : next.cost_per_liter) || 0;
        if (liters > 0 && price > 0) {
          next.total_cost_ars = (liters * price).toFixed(2);
        }
      }
      return next;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.plate || !form.fill_date) { setError("Patente y fecha son obligatorios"); return; }
    setSaving(true); setError("");
    try {
      const body = {
        plate: form.plate,
        fill_date: form.fill_date,
        liters: Number(form.liters) || 0,
        km_at_fill: Number(form.km_at_fill) || 0,
        cost_per_liter: Number(form.cost_per_liter) || 0,
        total_cost_ars: Number(form.total_cost_ars) || 0,
        fuel_type: form.fuel_type,
        notes: form.notes,
      };
      const res = await fetch(`${backendUrl}/v1/fleet/fuel`, { method: "POST", headers, body: JSON.stringify(body) });
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

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    try {
      await fetch(`${backendUrl}/v1/fleet/fuel/${id}`, { method: "DELETE", headers });
      invalidate();
    } catch { /* ignore */ }
  }

  async function handleImport(rows) {
    if (!rows.length) return;
    setImportMsg("");
    let ok = 0;
    for (const row of rows) {
      try {
        const liters = Number(row.liters) || 0;
        const cpl = Number(row.cost_per_liter) || 0;
        const body = {
          plate: String(row.plate).toUpperCase(),
          fill_date: row.fill_date,
          liters,
          km_at_fill: Number(row.km_at_fill) || 0,
          cost_per_liter: cpl,
          total_cost_ars: Number(row.total_cost_ars) || (liters * cpl),
          fuel_type: row.fuel_type || "nafta",
          notes: row.notes || "",
        };
        const res = await fetch(`${backendUrl}/v1/fleet/fuel`, { method: "POST", headers, body: JSON.stringify(body) });
        if (res.ok) ok++;
      } catch { /* ignore */ }
    }
    setImportMsg(`${ok} de ${rows.length} cargas importadas`);
    invalidate();
  }

  async function handleTestClick() {
    setTestBusy(true); setImportMsg(""); setShowImport(true);
    try {
      const rows = await runMockImport(backendUrl, apiKey, "/v1/external/parse-fuel-csv", "/mocks/combustible.xlsx", (r) => Boolean(r?.plate && r?.fill_date));
      await handleImport(rows);
    } catch (err) {
      setImportMsg(err.message);
    } finally { setTestBusy(false); }
  }

  // Stats
  const totalLiters = logs.reduce((s, l) => s + (l.liters ?? 0), 0);
  const totalCost = logs.reduce((s, l) => s + (l.total_cost_ars ?? 0), 0);
  const avgKmL = (() => {
    const valid = logs.filter((l) => l.liters > 0 && l.km_at_fill > 0);
    if (valid.length < 2) return null;
    const sorted = [...valid].sort((a, b) => new Date(a.fill_date) - new Date(b.fill_date));
    let totalKm = 0, totalL = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalKm += sorted[i].km_at_fill - sorted[i - 1].km_at_fill;
      totalL += sorted[i].liters;
    }
    return totalL > 0 ? (totalKm / totalL).toFixed(2) : null;
  })();

  // Chart data: group by month
  const chartData = logs.reduce((acc, l) => {
    const month = (l.fill_date ?? "").slice(0, 7);
    if (!month) return acc;
    const existing = acc.find((a) => a.month === month);
    if (existing) { existing.liters += l.liters ?? 0; existing.cost += l.total_cost_ars ?? 0; }
    else acc.push({ month, liters: l.liters ?? 0, cost: l.total_cost_ars ?? 0 });
    return acc;
  }, []).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

  return (
    <div className="space-y-5 fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink-1">Combustible</h2>
          <p className="text-sm text-ink-2">{logs.length} carga{logs.length !== 1 ? "s" : ""} registrada{logs.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestClick}
            disabled={testBusy}
            className="rounded-xl border border-edge px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3 transition-all hover:border-brand/40 hover:text-brand disabled:opacity-40"
          >
            {testBusy ? "..." : "▶ Test"}
          </button>
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
            + Registrar carga
          </button>
        </div>
      </div>

      {showImport && (
        <div>
          <AIExcelImport
            backendUrl={backendUrl}
            apiKey={apiKey}
            endpoint="/v1/external/parse-fuel-csv"
            columns={IMPORT_COLS}
            validate={(r) => Boolean(r?.plate && r?.fill_date)}
            onImport={handleImport}
            mockFile="/mocks/combustible.xlsx"
          />
          {importMsg && <p className="mt-2 text-xs text-ok font-display uppercase tracking-wider">{importMsg}</p>}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total litros" value={`${totalLiters.toLocaleString("es-AR", { minimumFractionDigits: 2 })} L`} />
        <StatCard label="Total costo ARS" value={`$${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`} />
        <StatCard label="Consumo promedio" value={avgKmL ? `${avgKmL} km/L` : "— (min 2 cargas)"} />
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="rounded-2xl border border-edge bg-layer-1 p-5">
          <p className="mb-3 font-display text-[11px] font-semibold uppercase tracking-widest text-ink-2">Consumo mensual (litros)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#7A7890" }} />
              <YAxis tick={{ fontSize: 10, fill: "#7A7890" }} />
              <Tooltip
                contentStyle={{ background: "#13131F", border: "1px solid #1C1C2E", borderRadius: "12px", fontSize: "11px" }}
                formatter={(v) => [`${v.toLocaleString("es-AR")} L`, "Litros"]}
              />
              <Bar dataKey="liters" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill="#E8931A" opacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
          <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-widest text-ink-1">Nueva carga</h3>
          <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Patente *</label>
              <select
                value={form.plate}
                onChange={(e) => handleFormChange("plate", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
              >
                <option value="">Seleccionar</option>
                {savedPlates.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Fecha *</label>
              <input type="date" value={form.fill_date} onChange={(e) => handleFormChange("fill_date", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Litros</label>
              <input type="number" step="0.01" value={form.liters} onChange={(e) => handleFormChange("liters", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Km al cargar</label>
              <input type="number" value={form.km_at_fill} onChange={(e) => handleFormChange("km_at_fill", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Precio/L (ARS)</label>
              <input type="number" step="0.01" value={form.cost_per_liter} onChange={(e) => handleFormChange("cost_per_liter", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Total ARS</label>
              <input type="number" step="0.01" value={form.total_cost_ars} onChange={(e) => handleFormChange("total_cost_ars", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Tipo de combustible</label>
              <select value={form.fuel_type} onChange={(e) => handleFormChange("fuel_type", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand">
                {FUEL_TYPES.map((t) => <option key={t} value={t}>{FUEL_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Notas</label>
              <input type="text" value={form.notes} onChange={(e) => handleFormChange("notes", e.target.value)}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
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
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-layer-1 py-16 text-center">
          <p className="font-display text-lg font-bold uppercase tracking-wider text-ink-3">Sin registros</p>
          <p className="mt-2 text-sm text-ink-3">Registrá la primera carga de combustible.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-edge bg-layer-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-edge">
                {["Patente", "Fecha", "Litros", "Km", "$/L", "Total ARS", "Tipo", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-edge/50 hover:bg-layer-2">
                  <td className="px-4 py-3 font-display font-bold text-ink-1">{l.plate}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{(l.fill_date ?? "").slice(0, 10)}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{(l.liters ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{(l.km_at_fill ?? 0).toLocaleString("es-AR")}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">${(l.cost_per_liter ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 font-mono text-ink-1 font-semibold">${(l.total_cost_ars ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-edge-hi px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-ink-2">
                      {FUEL_LABELS[l.fuel_type] ?? l.fuel_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(l.id)}
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

FuelPage.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  apiKey: PropTypes.string,
  token: PropTypes.string,
  savedPlates: PropTypes.arrayOf(PropTypes.string),
};
