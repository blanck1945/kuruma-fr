import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AIExcelImport, { runMockImport } from "../../components/AIExcelImport";

const IMPORT_COLS = [
  { key: "plate",      label: "Patente" },
  { key: "doc_type",   label: "Tipo" },
  { key: "doc_number", label: "Número" },
  { key: "issued_at",  label: "Emisión" },
  { key: "expires_at", label: "Vencimiento" },
];

const DOC_TYPES = ["vtv", "seguro", "rto", "habilitacion", "licencia", "otro"];
const DOC_LABELS = { vtv: "VTV", seguro: "Seguro", rto: "RTO", habilitacion: "Habilitación", licencia: "Licencia", otro: "Otro" };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00");
  return Math.round((d - today) / 86400000);
}

function DocStatusBadge({ expiresAt }) {
  if (!expiresAt) return <span className="font-display text-[9px] uppercase tracking-wide text-ink-3">Sin fecha</span>;
  const days = daysUntil(expiresAt);
  if (days < 0) return <span className="rounded-full border border-danger/40 bg-danger/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-danger">Vencido</span>;
  if (days < 30) return <span className="rounded-full border border-warn/40 bg-warn/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-warn">{days}d restantes</span>;
  return <span className="rounded-full border border-ok/40 bg-ok/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-ok">Vigente</span>;
}

const EMPTY_FORM = { plate: "", doc_type: "vtv", doc_number: "", issued_at: "", expires_at: "", notes: "" };

export default function DocumentsPage({ backendUrl, apiKey, token, savedPlates }) {
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

  const { data: allDocs = [], isLoading } = useQuery({
    queryKey: ["documents", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/documents`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const docs = useMemo(
    () => filterPlate ? allDocs.filter(d => d.plate === filterPlate) : allDocs,
    [allDocs, filterPlate]
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["documents", token] });

  async function handleSave(e) {
    e.preventDefault();
    if (!form.doc_type) { setError("El tipo de documento es obligatorio"); return; }
    setSaving(true); setError("");
    try {
      const body = {
        plate: form.plate,
        doc_type: form.doc_type,
        doc_number: form.doc_number,
        issued_at: form.issued_at || null,
        expires_at: form.expires_at || null,
        notes: form.notes,
      };
      const res = await fetch(`${backendUrl}/v1/fleet/documents`, { method: "POST", headers, body: JSON.stringify(body) });
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
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      await fetch(`${backendUrl}/v1/fleet/documents/${id}`, { method: "DELETE", headers });
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
          doc_type: row.doc_type || "otro",
          doc_number: row.doc_number || "",
          issued_at: row.issued_at || null,
          expires_at: row.expires_at || null,
          notes: row.notes || "",
        };
        const res = await fetch(`${backendUrl}/v1/fleet/documents`, { method: "POST", headers, body: JSON.stringify(body) });
        if (res.ok) ok++;
      } catch { /* ignore */ }
    }
    setImportMsg(`${ok} de ${rows.length} documentos importados`);
    invalidate();
  }

  async function handleTestClick() {
    setTestBusy(true); setImportMsg(""); setShowImport(true);
    try {
      const rows = await runMockImport(backendUrl, apiKey, "/v1/external/parse-documents-csv", "/mocks/documentos.xlsx", (r) => Boolean(r?.plate && r?.doc_type));
      await handleImport(rows);
    } catch (err) {
      setImportMsg(err.message);
    } finally { setTestBusy(false); }
  }

  // Group by plate
  const byPlate = docs.reduce((acc, d) => {
    const key = d.plate || "—";
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-5 fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink-1">Documentos</h2>
          <p className="text-sm text-ink-2">{docs.length} documento{docs.length !== 1 ? "s" : ""} registrado{docs.length !== 1 ? "s" : ""}</p>
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
            + Agregar
          </button>
        </div>
      </div>

      {showImport && (
        <div>
          <AIExcelImport
            backendUrl={backendUrl}
            apiKey={apiKey}
            endpoint="/v1/external/parse-documents-csv"
            columns={IMPORT_COLS}
            validate={(r) => Boolean(r?.plate && r?.doc_type)}
            onImport={handleImport}
            mockFile="/mocks/documentos.xlsx"
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
          <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-widest text-ink-1">Nuevo documento</h3>
          <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Patente</label>
              <select
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
              >
                <option value="">Sin patente (conductor)</option>
                {savedPlates.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Tipo *</label>
              <select
                value={form.doc_type}
                onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">N° de documento</label>
              <input type="text" value={form.doc_number} onChange={(e) => setForm((f) => ({ ...f, doc_number: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Emisión</label>
              <input type="date" value={form.issued_at} onChange={(e) => setForm((f) => ({ ...f, issued_at: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Vencimiento</label>
              <input type="date" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Notas</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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

      {/* Content */}
      {isLoading ? (
        <p className="text-sm text-ink-3">Cargando...</p>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-layer-1 py-16 text-center">
          <p className="font-display text-lg font-bold uppercase tracking-wider text-ink-3">Sin documentos</p>
          <p className="mt-2 text-sm text-ink-3">Agregá el primer documento con el botón de arriba.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byPlate).map(([plate, plateDocs]) => (
            <div key={plate} className="rounded-2xl border border-edge bg-layer-1 overflow-hidden">
              <div className="border-b border-edge bg-layer-2 px-5 py-3">
                <p className="font-display text-sm font-bold uppercase tracking-widest text-ink-1">{plate}</p>
              </div>
              <div className="grid gap-0 divide-y divide-edge">
                {plateDocs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-5 py-3 hover:bg-layer-2">
                    <div className="flex items-center gap-4">
                      <span className="w-24 font-display text-[10px] font-bold uppercase tracking-widest text-ink-2">
                        {DOC_LABELS[d.doc_type] ?? d.doc_type}
                      </span>
                      {d.doc_number && <span className="font-mono text-[11px] text-ink-2">{d.doc_number}</span>}
                      <DocStatusBadge expiresAt={d.expires_at} />
                      {d.expires_at && <span className="font-mono text-[10px] text-ink-3">{d.expires_at.slice(0, 10)}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 hover:border-danger/40 hover:text-danger"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

DocumentsPage.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  apiKey: PropTypes.string,
  token: PropTypes.string,
  savedPlates: PropTypes.arrayOf(PropTypes.string),
};
