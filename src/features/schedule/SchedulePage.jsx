import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AIExcelImport, { runMockImport } from "../../components/AIExcelImport";

const IMPORT_COLS = [
  { key: "plate",          label: "Patente" },
  { key: "driver_name",    label: "Conductor" },
  { key: "scheduled_date", label: "Fecha" },
  { key: "start_time",     label: "Inicio" },
  { key: "end_time",       label: "Fin" },
  { key: "notes",          label: "Notas" },
];

const DRIVER_COLORS = ["#E8931A", "#4ade80", "#60a5fa", "#f472b6", "#a78bfa", "#34d399", "#fb923c", "#e879f9"];
function driverColor(driverId) {
  if (!driverId) return DRIVER_COLORS[0];
  let h = 0;
  for (let i = 0; i < driverId.length; i++) h = (h * 31 + driverId.charCodeAt(i)) & 0xffff;
  return DRIVER_COLORS[h % DRIVER_COLORS.length];
}

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_LABELS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function monday(d) {
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  const day = t.getDay();
  t.setDate(t.getDate() - ((day + 6) % 7));
  return t;
}
function addDays(d, n) { const t = new Date(d); t.setDate(t.getDate() + n); return t; }
function dateStr(d) { return d.toISOString().slice(0, 10); }
function isToday(d) { return dateStr(d) === dateStr(new Date()); }
function isCurrentMonth(d, viewMonth) {
  return d.getMonth() === viewMonth.getMonth() && d.getFullYear() === viewMonth.getFullYear();
}

function buildCalendarWeeks(viewMonth) {
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const gridStart = monday(firstDay);
  const lastDayOfWeek = (lastDay.getDay() + 6) % 7;
  const gridEnd = addDays(lastDay, 6 - lastDayOfWeek);
  const weeks = [];
  let cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur = addDays(cur, 1); }
    weeks.push(week);
  }
  return weeks;
}

export default function SchedulePage({ backendUrl, apiKey, token, savedPlates }) {
  const qc = useQueryClient();
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [filterPlate, setFilterPlate] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ plate: "", driver_id: "", start_time: "", end_time: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [detail, setDetail] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [viewMode, setViewMode] = useState("calendar"); // "calendar" | "list"
  const [showImport, setShowImport] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [testBusy, setTestBusy] = useState(false);

  const authHeader = { Authorization: `Bearer ${token}` };
  const calendarWeeks = buildCalendarWeeks(viewMonth);
  const calendarStart = calendarWeeks[0][0];
  const calendarEnd = calendarWeeks[calendarWeeks.length - 1][6];

  const scheduleKey = ["schedule", token, dateStr(calendarStart), dateStr(calendarEnd)];

  const { data: rawEntries = [], isLoading } = useQuery({
    queryKey: scheduleKey,
    queryFn: () =>
      fetch(`${backendUrl}/v1/fleet/schedule?from=${dateStr(calendarStart)}&to=${dateStr(calendarEnd)}`, { headers: authHeader })
        .then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/drivers`, { headers: authHeader }).then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/vehicles`, { headers: authHeader }).then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const { data: maintenanceAll = [] } = useQuery({
    queryKey: ["maintenance", token],
    queryFn: () => fetch(`${backendUrl}/v1/fleet/maintenance`, { headers: authHeader }).then(r => r.json()).then(p => p.data ?? []),
    enabled: Boolean(token),
  });

  const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.plate, v]));

  const entries = rawEntries.filter(e => {
    if (filterPlate && e.plate !== filterPlate) return false;
    if (filterDriver && e.driver_id !== filterDriver) return false;
    return true;
  });

  // upcoming maintenances: next_service_date grouped by date
  const maintenanceByDate = {};
  for (const m of maintenanceAll) {
    if (!m.next_service_date) continue;
    const ds = m.next_service_date.slice(0, 10);
    if (!maintenanceByDate[ds]) maintenanceByDate[ds] = [];
    maintenanceByDate[ds].push(m);
  }

  function dayEntries(day) {
    const ds = dateStr(day);
    return entries.filter(e => e.scheduled_date?.slice(0, 10) === ds);
  }
  function dayMaintenance(day) {
    return maintenanceByDate[dateStr(day)] ?? [];
  }

  function openAdd(day) {
    setModal({ date: dateStr(day) });
    setForm({
      plate: filterPlate || (savedPlates[0] ?? ""),
      driver_id: filterDriver || (drivers[0]?.id ?? ""),
      start_time: "", end_time: "", notes: "",
    });
    setSaveErr("");
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.plate) { setSaveErr("Seleccioná una patente"); return; }
    if (!form.driver_id) { setSaveErr("Seleccioná un conductor"); return; }
    setSaving(true); setSaveErr("");
    try {
      const res = await fetch(`${backendUrl}/v1/fleet/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          plate: form.plate, driver_id: form.driver_id, scheduled_date: modal.date,
          start_time: form.start_time, end_time: form.end_time, notes: form.notes,
        }),
      });
      const p = await res.json();
      if (!res.ok || !p.success) throw new Error(p?.error?.message || "Error al guardar");
      setModal(null);
      qc.invalidateQueries({ queryKey: scheduleKey });
    } catch (err) { setSaveErr(err.message); } finally { setSaving(false); }
  }

  async function handleRemove(id) {
    await fetch(`${backendUrl}/v1/fleet/schedule/${id}`, { method: "DELETE", headers: authHeader });
    setDetail(null);
    qc.invalidateQueries({ queryKey: scheduleKey });
  }

  // Match driver_name from CSV to driver_id using the drivers list (case-insensitive, partial)
  function resolveDriverId(name) {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    const exact = drivers.find(d => d.name.toLowerCase() === n);
    if (exact) return exact.id;
    const partial = drivers.find(d => d.name.toLowerCase().includes(n) || n.includes(d.name.toLowerCase()));
    return partial?.id ?? null;
  }

  async function handleImport(rows) {
    if (!rows.length) return;
    setImportMsg("");
    let ok = 0;
    for (const row of rows) {
      const driverId = resolveDriverId(row.driver_name);
      if (!driverId || !row.plate || !row.scheduled_date) continue;
      try {
        const res = await fetch(`${backendUrl}/v1/fleet/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            plate: String(row.plate).toUpperCase(),
            driver_id: driverId,
            scheduled_date: row.scheduled_date,
            start_time: row.start_time || "",
            end_time: row.end_time || "",
            notes: row.notes || "",
          }),
        });
        if (res.ok) ok++;
      } catch { /* ignore */ }
    }
    const skipped = rows.length - ok;
    setImportMsg(`${ok} de ${rows.length} registros importados${skipped > 0 ? ` (${skipped} sin conductor coincidente)` : ""}`);
    qc.invalidateQueries({ queryKey: scheduleKey });
  }

  async function handleTestClick() {
    setTestBusy(true); setImportMsg(""); setShowImport(true);
    try {
      const rows = await runMockImport(backendUrl, apiKey, "/v1/external/parse-schedule-csv", "/mocks/horario.csv",
        r => Boolean(r?.plate && r?.scheduled_date));
      await handleImport(rows);
    } catch (err) {
      setImportMsg(err.message);
    } finally { setTestBusy(false); }
  }

  const todayStr = dateStr(new Date());

  return (
    <div className="space-y-5 fade-up" onMouseLeave={() => setTooltip(null)}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink-1">Horario</h2>
          <p className="text-sm text-ink-2">
            {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()} · {entries.length} asignación{entries.length !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Month nav */}
          <button
            type="button"
            onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="rounded-xl border border-edge px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => { const d = new Date(); setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
            className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-brand transition-all hover:bg-brand/10"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="rounded-xl border border-edge px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
          >
            →
          </button>

          {/* View toggle */}
          <div className="flex rounded-xl border border-edge overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest transition-all ${viewMode === "calendar" ? "bg-brand text-base" : "text-ink-2 hover:text-ink-1"}`}
            >
              Cal.
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest border-l border-edge transition-all ${viewMode === "list" ? "bg-brand text-base" : "text-ink-2 hover:text-ink-1"}`}
            >
              Lista
            </button>
          </div>

          {/* Import buttons */}
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
            onClick={() => { setShowImport(v => !v); setImportMsg(""); }}
            className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-brand transition-all hover:bg-brand/20"
          >
            CSV / Excel
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div>
          <AIExcelImport
            backendUrl={backendUrl}
            apiKey={apiKey}
            endpoint="/v1/external/parse-schedule-csv"
            columns={IMPORT_COLS}
            validate={r => Boolean(r?.plate && r?.scheduled_date)}
            onImport={handleImport}
            mockFile="/mocks/horario.csv"
          />
          {importMsg && (
            <p className="mt-2 font-display text-xs uppercase tracking-wider text-ok">{importMsg}</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">Filtrar por</span>
        <select
          value={filterPlate}
          onChange={e => setFilterPlate(e.target.value)}
          className="rounded-xl border border-edge bg-layer-2 px-3 py-1.5 font-mono text-xs text-ink-1 outline-none focus:border-brand"
        >
          <option value="">Todas las patentes</option>
          {savedPlates.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterDriver}
          onChange={e => setFilterDriver(e.target.value)}
          className="rounded-xl border border-edge bg-layer-2 px-3 py-1.5 font-mono text-xs text-ink-1 outline-none focus:border-brand"
        >
          <option value="">Todos los conductores</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {(filterPlate || filterDriver) && (
          <button
            type="button"
            onClick={() => { setFilterPlate(""); setFilterDriver(""); }}
            className="rounded-xl border border-edge px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3 transition-all hover:border-edge-hi hover:text-ink-1"
          >
            × Limpiar
          </button>
        )}
      </div>

      {/* ── List view ── */}
      {viewMode === "list" && (
        isLoading ? (
          <div className="py-12 text-center"><p className="text-sm text-ink-3">Cargando...</p></div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-layer-1 py-16 text-center">
            <p className="font-display text-lg font-bold uppercase tracking-wider text-ink-3">Sin asignaciones</p>
            <p className="mt-2 text-sm text-ink-3">Importá un CSV o agregá desde el calendario.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-edge bg-layer-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-edge bg-layer-2">
                  {["Fecha", "Día", "Patente", "Conductor", "Horario", "Notas", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...entries]
                  .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""))
                  .map(e => {
                    const d = new Date(e.scheduled_date + "T00:00:00");
                    const isPast = e.scheduled_date?.slice(0, 10) < todayStr;
                    return (
                      <tr key={e.id} className="border-b border-edge/50 hover:bg-layer-2 transition-colors">
                        <td className="px-4 py-3 font-mono text-ink-2 whitespace-nowrap">
                          {e.scheduled_date?.slice(0, 10) ?? "—"}
                          {isPast && <span className="ml-1.5 rounded-full border border-ink-3/20 px-1.5 py-0.5 font-display text-[8px] uppercase tracking-wide text-ink-3">Pasado</span>}
                        </td>
                        <td className="px-4 py-3 font-display text-[10px] uppercase tracking-wider text-ink-3">
                          {DAY_LABELS[(d.getDay() + 6) % 7]}
                        </td>
                        <td className="px-4 py-3">
                          <div className="plate-badge scale-75 origin-left">
                            <div className="plate-band" />
                            <div className="plate-text text-[10px] px-2">{e.plate}</div>
                            <div className="plate-band" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: driverColor(e.driver_id) }} />
                            <span className="font-display text-[10px] font-bold uppercase tracking-wide text-ink-1">{e.driver_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-2 whitespace-nowrap">
                          {e.start_time || e.end_time ? `${e.start_time || ""}${e.end_time ? `–${e.end_time}` : ""}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-ink-3 max-w-[180px] truncate">{e.notes || "—"}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleRemove(e.id)}
                            className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 hover:border-danger/40 hover:text-danger transition-all"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Calendar */}
      {viewMode === "calendar" && isLoading ? (
        <div className="py-12 text-center"><p className="text-sm text-ink-3">Cargando...</p></div>
      ) : viewMode === "calendar" && (
        <div className="rounded-2xl border border-edge bg-layer-1 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-edge bg-layer-2">
            {DAY_LABELS.map(d => (
              <div key={d} className="py-2.5 text-center font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {calendarWeeks.map((week, wi) => (
            <div key={wi} className={`grid grid-cols-7 ${wi < calendarWeeks.length - 1 ? "border-b border-edge" : ""}`}>
              {week.map((day, di) => {
                const inMonth = isCurrentMonth(day, viewMonth);
                const ces = dayEntries(day);
                const mxs = dayMaintenance(day);
                const today = isToday(day);
                const past = dateStr(day) < todayStr;

                return (
                  <div
                    key={di}
                    className={[
                      "min-h-[88px] p-1.5 relative",
                      di > 0 ? "border-l border-edge" : "",
                      !inMonth ? "bg-black/20" : today ? "bg-brand/5" : "",
                    ].join(" ")}
                  >
                    {/* Date number */}
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className={[
                        "inline-flex items-center justify-center w-5 h-5 rounded-full font-display text-[11px] font-bold shrink-0",
                        today ? "bg-brand text-base" : inMonth ? "text-ink-1" : "text-ink-3",
                      ].join(" ")}>
                        {day.getDate()}
                      </span>
                      {/* Maintenance badge */}
                      {mxs.length > 0 && (
                        <span
                          className="rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-display text-[8px] font-bold uppercase tracking-wide text-warn cursor-help"
                          title={mxs.map(m => `${m.plate}: ${m.description || m.type}`).join("\n")}
                        >
                          🔧 {mxs.length > 1 ? mxs.length : ""}
                        </span>
                      )}
                    </div>

                    {/* Schedule entries */}
                    <div className="flex flex-col gap-0.5">
                      {ces.map(entry => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setDetail(entry)}
                          onMouseEnter={e => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setTooltip({ entry, x: r.left, y: r.bottom + 4 });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            borderColor: driverColor(entry.driver_id) + "55",
                            backgroundColor: driverColor(entry.driver_id) + "18",
                          }}
                          className="w-full text-left rounded-md border px-1.5 py-0.5 transition-all hover:opacity-80 cursor-pointer"
                        >
                          <p
                            className="font-display text-[9px] font-bold uppercase tracking-wide truncate leading-tight"
                            style={{ color: driverColor(entry.driver_id) }}
                          >
                            {entry.driver_name}
                          </p>
                          <p className="font-mono text-[8px] text-ink-3 truncate leading-tight">
                            {entry.plate}{entry.start_time ? ` · ${entry.start_time}` : ""}
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* Add button — only future/today days in current month */}
                    {!past && inMonth && (
                      <button
                        type="button"
                        onClick={() => openAdd(day)}
                        className="mt-0.5 w-full rounded-md border border-dashed border-edge text-ink-3 hover:border-brand/50 hover:text-brand transition-all flex items-center justify-center h-5"
                      >
                        <span className="font-display text-[10px] font-semibold leading-none">+</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Legend: maintenance key */}
      <div className="flex flex-wrap items-center gap-4">
        {drivers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {drivers.map(d => (
              <div
                key={d.id}
                className="flex items-center gap-1.5 rounded-full border border-edge px-2.5 py-1"
                style={{ borderColor: driverColor(d.id) + "44" }}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: driverColor(d.id) }} />
                <span className="font-display text-[10px] uppercase tracking-wider text-ink-2">{d.name}</span>
              </div>
            ))}
          </div>
        )}
        {Object.keys(maintenanceByDate).length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/5 px-2.5 py-1">
            <span className="font-display text-[9px] uppercase tracking-wider text-warn">🔧 Mantenimiento programado</span>
          </div>
        )}
      </div>

      {/* ── Hover tooltip ── */}
      {tooltip && (() => {
        const { entry, x, y } = tooltip;
        const driver = driverMap[entry.driver_id];
        const vehicle = vehicleMap[entry.plate];
        return (
          <div
            className="fixed z-[200] pointer-events-none rounded-xl border border-edge-hi bg-layer-2 shadow-2xl shadow-black/60 p-3 text-left"
            style={{ left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 160), width: 210 }}
          >
            {/* Driver */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: driverColor(entry.driver_id) }} />
              <p className="font-display text-xs font-bold uppercase tracking-wide text-ink-1 truncate">{entry.driver_name}</p>
            </div>
            {driver?.phone && (
              <p className="font-mono text-[10px] text-ink-3 mb-0.5">📞 {driver.phone}</p>
            )}
            {driver?.license_number && (
              <p className="font-mono text-[10px] text-ink-3">Lic. {driver.license_number}</p>
            )}

            {/* Divider */}
            <div className="my-2 border-t border-edge" />

            {/* Vehicle */}
            <div className="plate-badge scale-[0.65] origin-left mb-1">
              <div className="plate-band" />
              <div className="plate-text text-[10px] px-2">{entry.plate}</div>
              <div className="plate-band" />
            </div>
            {vehicle?.make && (
              <p className="font-mono text-[10px] text-ink-3">
                {vehicle.make}{vehicle.year ? ` · ${vehicle.year}` : ""}
              </p>
            )}
            {vehicle?.type && (
              <p className="font-mono text-[10px] text-ink-3 capitalize">{vehicle.type}</p>
            )}

            {/* Time */}
            {(entry.start_time || entry.end_time) && (
              <p className="font-mono text-[10px] text-brand mt-1.5">
                {entry.start_time}{entry.end_time ? `–${entry.end_time}` : ""}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Add modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-edge bg-layer-1 p-6 shadow-2xl shadow-black/60 fade-up">
            <h3 className="mb-1 font-display text-sm font-bold uppercase tracking-widest text-ink-1">Asignar conductor</h3>
            <p className="mb-4 font-mono text-xs text-ink-3">{modal.date}</p>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Patente *</label>
                <select
                  value={form.plate}
                  onChange={e => setForm(f => ({ ...f, plate: e.target.value }))}
                  className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
                >
                  <option value="">Seleccioná una patente</option>
                  {savedPlates.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Conductor *</label>
                {drivers.length === 0 ? (
                  <p className="text-xs text-ink-3">No hay conductores. Habilitá el módulo Conductores primero.</p>
                ) : (
                  <select
                    value={form.driver_id}
                    onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
                    className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
                  >
                    <option value="">Seleccioná un conductor</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Desde</label>
                  <input
                    type="time" value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Hasta</label>
                  <input
                    type="time" value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">Notas</label>
                <input
                  type="text" value={form.notes} placeholder="opcional"
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl border border-edge bg-layer-2 px-3 py-2 font-mono text-xs text-ink-1 outline-none focus:border-brand"
                />
              </div>
              {saveErr && <p className="text-xs text-danger">{saveErr}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving || drivers.length === 0}
                  className="flex-1 rounded-xl bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030] disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Asignar"}
                </button>
                <button
                  type="button" onClick={() => setModal(null)}
                  className="rounded-xl border border-edge px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail popup ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-edge bg-layer-1 p-6 shadow-2xl shadow-black/60 fade-up">
            <div className="mb-4 flex items-start gap-3">
              <span className="inline-block h-3 w-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: driverColor(detail.driver_id) }} />
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-1">{detail.driver_name}</p>
                <p className="font-mono text-xs text-ink-3 mt-0.5">
                  {detail.plate} · {detail.scheduled_date?.slice(0, 10)}
                  {detail.start_time ? ` · ${detail.start_time}` : ""}
                  {detail.end_time ? `–${detail.end_time}` : ""}
                </p>
                {driverMap[detail.driver_id]?.phone && (
                  <p className="font-mono text-xs text-ink-3 mt-0.5">📞 {driverMap[detail.driver_id].phone}</p>
                )}
                {vehicleMap[detail.plate]?.make && (
                  <p className="font-mono text-xs text-ink-3 mt-0.5">
                    {vehicleMap[detail.plate].make}{vehicleMap[detail.plate].year ? ` · ${vehicleMap[detail.plate].year}` : ""}
                  </p>
                )}
              </div>
            </div>
            {detail.notes && (
              <p className="mb-4 rounded-lg bg-layer-2 px-3 py-2 text-xs text-ink-2">{detail.notes}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button" onClick={() => handleRemove(detail.id)}
                className="flex-1 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-danger transition-all hover:bg-danger/10"
              >
                Eliminar
              </button>
              <button
                type="button" onClick={() => setDetail(null)}
                className="rounded-xl border border-edge px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
