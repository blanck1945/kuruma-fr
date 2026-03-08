import { useState } from "react";
import PropTypes from "prop-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DriverCSVImport from "./DriverCSVImport";
import { runMockImport } from "../../components/AIExcelImport";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00");
  return Math.round((d - today) / 86400000);
}

function LicenseBadge({ expiresAt }) {
  if (!expiresAt) return <span className="text-[10px] text-ink-3 font-mono">Sin fecha</span>;
  const days = daysUntil(expiresAt);
  if (days < 0) return <span className="rounded-full border border-danger/40 bg-danger/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-danger">Vencida</span>;
  if (days < 30) return <span className="rounded-full border border-warn/40 bg-warn/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-warn">Vence en {days}d</span>;
  return <span className="rounded-full border border-ok/40 bg-ok/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-ok">Vigente</span>;
}

const EMPTY_FORM = { name: "", dni: "", license_number: "", license_expires_at: "", phone: "", email: "", notes: "" };

export default function DriversPage({ backendUrl, apiKey, token, savedPlates }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [assignPlate, setAssignPlate] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const authHeader = { Authorization: `Bearer ${token}` };
  const headers = { "Content-Type": "application/json", ...authHeader };

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ["drivers", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/drivers`, { headers: authHeader }).then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const { data: assignments = {} } = useQuery({
    queryKey: ["assignments", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/assignments`, { headers: authHeader }).then(r => r.json()).then(p => {
      const map = {};
      for (const a of (p.data ?? [])) if (!map[a.driver_id]) map[a.driver_id] = a.plate;
      return map;
    }),
    enabled: Boolean(token),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["drivers", token] });
    qc.invalidateQueries({ queryKey: ["assignments", token] });
  }

  function openNew() { setForm(EMPTY_FORM); setEditId(null); setShowForm(true); setError(""); }

  function openEdit(d) {
    setForm({
      name: d.name ?? "",
      dni: d.dni ?? "",
      license_number: d.license_number ?? "",
      license_expires_at: d.license_expires_at ? d.license_expires_at.slice(0, 10) : "",
      phone: d.phone ?? "",
      email: d.email ?? "",
      notes: d.notes ?? "",
    });
    setEditId(d.id);
    setShowForm(true);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true); setError("");
    try {
      const body = { ...form, license_expires_at: form.license_expires_at || null };
      const url = editId ? `${backendUrl}/v1/fleet/drivers/${editId}` : `${backendUrl}/v1/fleet/drivers`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      const p = await res.json();
      if (!res.ok || !p.success) throw new Error(p?.error?.message || "Error al guardar");
      setShowForm(false);
      invalidate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearAll() {
    if (!confirm("¿Eliminar TODOS los conductores? Esta acción no se puede deshacer.")) return;
    try {
      await fetch(`${backendUrl}/v1/fleet/drivers`, { method: "DELETE", headers });
      invalidate();
    } catch { /* ignore */ }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este conductor?")) return;
    try {
      await fetch(`${backendUrl}/v1/fleet/drivers/${id}`, { method: "DELETE", headers });
      invalidate();
    } catch { /* ignore */ }
  }

  async function handleAssign(driverId) {
    if (!assignPlate) return;
    setAssignBusy(true);
    try {
      await fetch(`${backendUrl}/v1/fleet/drivers/${driverId}/assign/${assignPlate}`, {
        method: "POST", headers: authHeader,
      });
      setAssigningId(null);
      setAssignPlate("");
      qc.invalidateQueries({ queryKey: ["assignments", token] });
    } catch { /* ignore */ }
    finally { setAssignBusy(false); }
  }

  async function handleUnassign(driverId, plate) {
    setAssignBusy(true);
    try {
      await fetch(`${backendUrl}/v1/fleet/drivers/${driverId}/unassign/${plate}`, {
        method: "POST", headers: authHeader,
      });
      qc.invalidateQueries({ queryKey: ["assignments", token] });
    } catch { /* ignore */ }
    finally { setAssignBusy(false); }
  }

  async function handleImport(rows) {
    if (!rows.length) return;
    setImporting(true);
    setImportMsg("");
    let ok = 0;
    for (const row of rows) {
      try {
        const body = {
          name: row.name,
          dni: row.dni || "",
          license_number: row.license_number || "",
          license_expires_at: row.license_expires_at || null,
          phone: row.phone || "",
          email: row.email || "",
          notes: row.notes || "",
        };
        const res = await fetch(`${backendUrl}/v1/fleet/drivers`, {
          method: "POST", headers, body: JSON.stringify(body),
        });
        if (res.ok) ok++;
      } catch { /* ignore individual failures */ }
    }
    setImportMsg(`${ok} de ${rows.length} conductores importados`);
    setImporting(false);
    invalidate();
  }

  async function seedTestAssignments(importedDrivers) {
    const plates = ["ABC123", "DEF456", "GHI789"];
    if (!importedDrivers.length) return;
    try {
      if (importedDrivers[0]) {
        await fetch(`${backendUrl}/v1/fleet/drivers/${importedDrivers[0].id}/assign/ABC123`, { method: "POST", headers: authHeader });
        await fetch(`${backendUrl}/v1/fleet/drivers/${importedDrivers[0].id}/unassign/ABC123`, { method: "POST", headers: authHeader });
      }
      if (importedDrivers[1]) {
        await fetch(`${backendUrl}/v1/fleet/drivers/${importedDrivers[1].id}/assign/ABC123`, { method: "POST", headers: authHeader });
      }
      for (let i = 0; i < Math.min(importedDrivers.length, plates.length); i++) {
        if (i === 1) continue;
        const d = importedDrivers[i];
        if (d && plates[i]) {
          await fetch(`${backendUrl}/v1/fleet/drivers/${d.id}/assign/${plates[i]}`, { method: "POST", headers: authHeader });
        }
      }
      qc.invalidateQueries({ queryKey: ["assignments", token] });
    } catch { /* ignore */ }
  }

  async function handleTestClick() {
    setTestBusy(true); setImportMsg(""); setShowImport(true);
    try {
      const rows = await runMockImport(backendUrl, apiKey, "/v1/external/parse-drivers-csv", "/mocks/conductores.xlsx", (r) => Boolean(r?.name?.trim()));
      await handleImport(rows);
      // Fetch freshly-saved drivers to get their IDs for assignment seeding
      const res = await fetch(`${backendUrl}/v1/fleet/drivers`, { headers: authHeader });
      const p = await res.json();
      if (p.success && p.data?.length) {
        await seedTestAssignments(p.data);
        setImportMsg((m) => m + " · Asignaciones de prueba creadas");
      }
    } catch (err) {
      setImportMsg(err.message);
    } finally { setTestBusy(false); }
  }

  // plates not yet assigned to any driver
  const assignedPlates = new Set(Object.values(assignments));
  const freePlates = savedPlates.filter((p) => !assignedPlates.has(p));

  return (
    <div className="space-y-5 fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink-1">Conductores</h2>
          <p className="text-sm text-ink-2">{drivers.length} conductor{drivers.length !== 1 ? "es" : ""} registrado{drivers.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {drivers.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-xl border border-edge px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3 transition-all hover:border-danger/40 hover:text-danger"
            >
              Limpiar todo
            </button>
          )}
          <button
            type="button"
            onClick={() => { setShowImport((v) => !v); setImportMsg(""); }}
            className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-brand transition-all hover:bg-brand/20"
          >
            CSV / Excel
          </button>
          <button
            type="button"
            onClick={openNew}
            className="rounded-xl bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030]"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* CSV Import */}
      {showImport && (
        <div>
          <DriverCSVImport
            backendUrl={backendUrl}
            apiKey={apiKey}
            onImport={handleImport}
          />
          {importing && (
            <p className="mt-2 text-xs text-brand font-display uppercase tracking-wider">Guardando conductores...</p>
          )}
          {importMsg && !importing && (
            <p className="mt-2 text-xs text-ok font-display uppercase tracking-wider">{importMsg}</p>
          )}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-brand/30 bg-layer-1 p-5">
          <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-widest text-ink-1">
            {editId ? "Editar conductor" : "Nuevo conductor"}
          </h3>
          <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
            {[
              { id: "name", label: "Nombre *", type: "text" },
              { id: "dni", label: "DNI", type: "text" },
              { id: "license_number", label: "N° Licencia", type: "text" },
              { id: "license_expires_at", label: "Vencimiento licencia", type: "date" },
              { id: "phone", label: "Teléfono", type: "text" },
              { id: "email", label: "Email", type: "email" },
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

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-ink-3">Cargando...</p>
      ) : drivers.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-layer-1 py-16 text-center">
          <p className="font-display text-lg font-bold uppercase tracking-wider text-ink-3">Sin conductores</p>
          <p className="mt-2 text-sm text-ink-3">Agregá tu primer conductor con el botón de arriba.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drivers.map((d) => {
            const assignedPlate = assignments[d.id];
            const isAssigning = assigningId === d.id;
            // plates available for this driver: free plates + its current plate
            const availablePlates = assignedPlate
              ? [assignedPlate, ...freePlates]
              : freePlates;

            return (
              <div key={d.id} className="rounded-2xl border border-edge bg-layer-1 p-4">
                {/* Top row: info + actions */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-1">{d.name}</p>
                      <LicenseBadge expiresAt={d.license_expires_at} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-ink-2">
                      {d.dni && <span>DNI {d.dni}</span>}
                      {d.license_number && <span>Lic. {d.license_number}</span>}
                      {d.phone && <span>{d.phone}</span>}
                      {d.email && <span>{d.email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 hover:border-brand/40 hover:text-brand"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 hover:border-danger/40 hover:text-danger"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                {/* Vehicle assignment row */}
                <div className="mt-3 pt-3 border-t border-edge flex flex-wrap items-center gap-2">
                  <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">Vehículo:</span>

                  {assignedPlate && !isAssigning ? (
                    <>
                      <span className="rounded-full border border-brand/40 bg-brand/5 px-2.5 py-0.5 font-mono text-[11px] font-bold text-brand">
                        {assignedPlate}
                      </span>
                      <button
                        type="button"
                        disabled={assignBusy}
                        onClick={() => handleUnassign(d.id, assignedPlate)}
                        className="rounded-lg border border-edge px-2.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 hover:border-danger/40 hover:text-danger disabled:opacity-50"
                      >
                        Desasignar
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAssigningId(d.id); setAssignPlate(assignedPlate); }}
                        className="rounded-lg border border-edge px-2.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-2 hover:border-brand/40 hover:text-brand"
                      >
                        Cambiar
                      </button>
                    </>
                  ) : isAssigning ? (
                    <>
                      <select
                        value={assignPlate}
                        onChange={(e) => setAssignPlate(e.target.value)}
                        className="rounded-lg border border-edge bg-layer-2 px-2 py-1 font-mono text-xs text-ink-1 outline-none focus:border-brand"
                      >
                        <option value="">Seleccionar patente</option>
                        {availablePlates.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={!assignPlate || assignBusy}
                        onClick={() => handleAssign(d.id)}
                        className="rounded-lg bg-brand px-2.5 py-1 font-display text-[9px] font-bold uppercase tracking-widest text-base disabled:opacity-50"
                      >
                        {assignBusy ? "..." : "Asignar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAssigningId(null); setAssignPlate(""); }}
                        className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-2"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={savedPlates.length === 0}
                      onClick={() => { setAssigningId(d.id); setAssignPlate(""); }}
                      className="rounded-lg border border-dashed border-edge px-2.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 hover:border-brand/40 hover:text-brand disabled:opacity-40"
                    >
                      + Asignar vehículo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

DriversPage.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  apiKey: PropTypes.string,
  token: PropTypes.string,
  savedPlates: PropTypes.arrayOf(PropTypes.string),
};
