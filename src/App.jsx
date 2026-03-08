import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { FormField } from "./components/ui/FormField";
import { PrimaryButton } from "./components/ui/PrimaryButton";
import { FineResultList } from "./features/fines/FineResultList";
import { ui } from "./components/ui/uiClasses";
import ArgentinaMap from "./features/map/ArgentinaMap";
import AssistantPage from "./features/assistant/AssistantPage";
import PlateCSVImport from "./features/plates/PlateCSVImport";
import LoginPage from "./features/auth/LoginPage";
import { ThemeSwitcher } from "./components/ui/ThemeSwitcher";
import { applyTheme } from "./themes";
import VehicleDetailPage from "./features/fleet/VehicleDetailPage";
import AnalyticsPage from "./features/analytics/AnalyticsPage";
import ModulesPage from "./features/settings/ModulesPage";
import DriversPage from "./features/drivers/DriversPage";
import MaintenancePage from "./features/maintenance/MaintenancePage";
import DocumentsPage from "./features/documents/DocumentsPage";
import FuelPage from "./features/fuel/FuelPage";
import SchedulePage from "./features/schedule/SchedulePage";
import { queryClient } from "./lib/queryClient";

const defaultBackendUrl = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080").replace(/\/$/, "");
const defaultApiKey = import.meta.env.VITE_API_KEY ?? "external-secret-1";
const AUTH_KEY = "kuruma_auth";

function normalizePlate(value) {
  return value.toUpperCase().replaceAll("-", "").replaceAll(" ", "");
}
function plateLooksValid(value) {
  return /^[A-Z]{2,3}[0-9]{3}[A-Z]{0,2}$/.test(value);
}
function normalizeDocument(value) {
  return value.replaceAll(/\D/g, "");
}
function documentLooksValid(value) {
  return /^[0-9]{7,11}$/.test(value);
}
function parsePlateTokens(value) {
  return value.split(/[\s,;]+/).map((t) => normalizePlate(t)).filter(Boolean);
}
function vtvDaysLeft(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

/* ── Argentine plate badge ──────────────────── */
function PlateBadge({ plate, size = "md" }) {
  const textSize = size === "lg" ? "text-xl" : "text-[13px]";
  const padX = size === "lg" ? "px-4" : "px-3";
  return (
    <div className="plate-badge">
      <div className="plate-band" />
      <div className={`plate-text ${textSize} ${padX}`}>{plate}</div>
      <div className="plate-band" />
    </div>
  );
}

/* ── Nav ────────────────────────────────────── */
const NAV_BASE = [
  { id: "patentes",  label: "Mi Flota" },
  { id: "consulta",  label: "Consulta" },
];
const MODULE_TABS = [
  { id: "conductores",   module: "conductores",   label: "Conductores" },
  { id: "mantenimiento", module: "mantenimiento", label: "Mantenimiento" },
  { id: "documentos",    module: "documentos",    label: "Documentos" },
  { id: "combustible",   module: "combustible",   label: "Combustible" },
  { id: "horario",       module: "horario",       label: "Horario" },
];

export default function App() {
  /* Auth */
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) ?? "null"); }
    catch { return null; }
  });

  const enabledModules = auth?.org?.enabled_modules ?? [];

  function handleLogin(data) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
    setAuth(data);
  }
  function handleLogout() {
    localStorage.removeItem(AUTH_KEY);
    queryClient.clear();
    setAuth(null);
    setSavedPlates([]);
    setVehicleProfiles({});
    setVehicleVTVDates({});
  }
  function handleModulesUpdate(modules) {
    setAuth((prev) => {
      const next = { ...prev, org: { ...prev.org, enabled_modules: modules } };
      localStorage.setItem(AUTH_KEY, JSON.stringify(next));
      return next;
    });
  }

  /* Pages */
  const [page, setPage] = useState("patentes");
  const [source, setSource] = useState("all");
  const [queryType, setQueryType] = useState("plate");
  const [plate, setPlate] = useState("");
  const [document, setDocument] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  /* Fleet */
  const [newPlate, setNewPlate] = useState("");
  const [bulkPlates, setBulkPlates] = useState("");
  const [platesMessage, setPlatesMessage] = useState("");
  const [savedPlates, setSavedPlates] = useState([]);
  const [vehicleProfiles, setVehicleProfiles] = useState({});
  const [vehicleProfileLoading, setVehicleProfileLoading] = useState({});
  const [fleetView, setFleetView] = useState(() => localStorage.getItem("kuruma_fleet_view") ?? "cards");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("single");
  const [currentTheme, setCurrentTheme] = useState("noir");
  const [selectedPlate, setSelectedPlate] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [vehicleVTVDates, setVehicleVTVDates] = useState({}); // { [plate]: "YYYY-MM-DD" | null }
  const [fleetStats, setFleetStats] = useState({}); // { [plate]: { driver, maintenance, documents, fuel } }

  const handleAddChart = useCallback(() => {
    setPage("analisis");
    setChatOpen(false);
  }, []);

  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  // Clear selected vehicle when leaving Mi Flota tab
  useEffect(() => { if (page !== "patentes") setSelectedPlate(null); }, [page]);

  useEffect(() => {
    if (!auth) { setSavedPlates([]); setVehicleProfiles({}); return; }
    fetch(`${defaultBackendUrl}/v1/fleet/vehicles`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.success && Array.isArray(payload.data)) {
          setSavedPlates(payload.data.map((v) => v.plate));
          setVehicleProfiles((prev) => {
            const next = { ...prev };
            for (const v of payload.data) {
              if (v.make || v.model || v.year) {
                next[v.plate] = { data: { make: v.make, model: v.model, year: v.year, type: v.type }, error: "" };
              }
            }
            return next;
          });
          setVehicleVTVDates((prev) => {
            const next = { ...prev };
            for (const v of payload.data) {
              next[v.plate] = v.vtv_due_date
                ? v.vtv_due_date.slice(0, 10)
                : null;
            }
            return next;
          });
        }
      })
      .catch(() => {});
  }, [auth]);

  const loadFleetStats = useCallback(async () => {
    if (!auth?.token || savedPlates.length === 0) return;
    const h = { Authorization: `Bearer ${auth.token}` };
    const stats = {};
    for (const p of savedPlates) stats[p] = { driver: null, maintenance: 0, documents: 0, fuel: 0 };

    const fetches = [];
    if (enabledModules.includes("conductores")) {
      fetches.push(
        Promise.all([
          fetch(`${defaultBackendUrl}/v1/fleet/assignments`, { headers: h }).then((r) => r.json()),
          fetch(`${defaultBackendUrl}/v1/fleet/drivers`, { headers: h }).then((r) => r.json()),
        ]).then(([asgn, drvs]) => {
          const driverMap = {};
          if (drvs.success) for (const d of drvs.data) driverMap[d.id] = d.name;
          if (asgn.success) for (const a of asgn.data) {
            if (stats[a.plate]) stats[a.plate].driver = driverMap[a.driver_id] ?? null;
          }
        }).catch(() => {})
      );
    }
    if (enabledModules.includes("mantenimiento")) {
      fetches.push(
        fetch(`${defaultBackendUrl}/v1/fleet/maintenance`, { headers: h }).then((r) => r.json())
          .then((p) => { if (p.success) for (const r of p.data) { if (stats[r.plate]) stats[r.plate].maintenance++; } })
          .catch(() => {})
      );
    }
    if (enabledModules.includes("documentos")) {
      fetches.push(
        fetch(`${defaultBackendUrl}/v1/fleet/documents`, { headers: h }).then((r) => r.json())
          .then((p) => { if (p.success) for (const r of p.data) { if (stats[r.plate]) stats[r.plate].documents++; } })
          .catch(() => {})
      );
    }
    if (enabledModules.includes("combustible")) {
      fetches.push(
        fetch(`${defaultBackendUrl}/v1/fleet/fuel`, { headers: h }).then((r) => r.json())
          .then((p) => { if (p.success) for (const r of p.data) { if (stats[r.plate]) stats[r.plate].fuel++; } })
          .catch(() => {})
      );
    }
    await Promise.all(fetches);
    setFleetStats({ ...stats });
  }, [auth, savedPlates, enabledModules]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page === "patentes" && !selectedPlate) loadFleetStats();
  }, [page, selectedPlate, loadFleetStats]);

  /* Derived */
  const normalizedPlate = useMemo(() => normalizePlate(plate), [plate]);
  const normalizedDocument = useMemo(() => normalizeDocument(document), [document]);
  const plateCanSearch = normalizedPlate.length >= 6 && plateLooksValid(normalizedPlate);
  const documentCanSearch = documentLooksValid(normalizedDocument);
  const canSearch = queryType === "plate" ? plateCanSearch : documentCanSearch;
  const plateError = queryType === "plate" && plate.length > 0 && !plateCanSearch ? "Formato inválido." : "";
  const documentError = queryType === "document" && document.length > 0 && !documentCanSearch ? "DNI inválido (7-11 dígitos)." : "";
  const newPlateNormalized = useMemo(() => normalizePlate(newPlate), [newPlate]);
  const newPlateError = newPlate.length > 0 && !plateLooksValid(newPlateNormalized) ? "Formato inválido." : "";
  const activeValue = queryType === "plate" ? normalizedPlate : normalizedDocument;
  const savedPlatesCount = savedPlates.length;
  const activeVehicleProfileLoads = useMemo(
    () => Object.values(vehicleProfileLoading).filter(Boolean).length,
    [vehicleProfileLoading],
  );

  const fleetHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth?.token ?? ""}`,
  }), [auth]);

  /* API */
  const searchFines = useCallback(async (currentValue, mode) => {
    if (!currentValue) return;
    setIsLoading(true); setHasSearched(true); setError("");
    try {
      const params = new URLSearchParams();
      params.set(mode === "document" ? "document" : "plate", currentValue);
      if (source !== "all") params.set("source", source);
      const result = await fetch(
        `${defaultBackendUrl}/v1/external/fines?${params}`,
        { headers: { "X-API-Key": defaultApiKey } },
      );
      const payload = await result.json();
      if (!result.ok || payload.success === false) throw new Error(payload?.error?.message || `Error HTTP ${result.status}`);
      setResponse(payload);
      setLastUpdatedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setResponse(null);
      setError(err instanceof Error ? err.message : "No se pudo completar la consulta");
    } finally { setIsLoading(false); }
  }, [source]);

  const lookupVehicleProfile = useCallback(async (plateValue) => {
    setVehicleProfileLoading((c) => ({ ...c, [plateValue]: true }));
    setPlatesMessage("");
    try {
      const params = new URLSearchParams(); params.set("plate", plateValue);
      const result = await fetch(
        `${defaultBackendUrl}/v1/external/vehicle-profile?${params}`,
        { headers: { "X-API-Key": defaultApiKey } },
      );
      const payload = await result.json();
      if (!result.ok || payload.success === false) {
        throw new Error(payload?.error?.code === "NOT_FOUND"
          ? "No encontramos datos para esta patente."
          : payload?.error?.message || `Error HTTP ${result.status}`);
      }
      setVehicleProfiles((c) => ({ ...c, [plateValue]: { data: payload.data, error: "" } }));
      setPlatesMessage(`Perfil consultado: ${plateValue}`);
    } catch (err) {
      setVehicleProfiles((c) => ({ ...c, [plateValue]: { data: null, error: err.message } }));
      setPlatesMessage(`Sin perfil para ${plateValue}`);
    } finally { setVehicleProfileLoading((c) => ({ ...c, [plateValue]: false })); }
  }, []);

  const addSinglePlate = useCallback(async () => {
    const p = normalizePlate(newPlate);
    if (!plateLooksValid(p)) { setPlatesMessage("Formato de patente inválido."); return; }
    if (savedPlates.includes(p)) { setPlatesMessage("La patente ya está cargada."); return; }
    try {
      const res = await fetch(`${defaultBackendUrl}/v1/fleet/vehicles`, {
        method: "POST", headers: fleetHeaders, body: JSON.stringify({ plate: p }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload?.error?.message || "Error al guardar");
      setSavedPlates((prev) => [...prev, p]);
      setPlatesMessage(`${p} agregada.`);
      void lookupVehicleProfile(p);
      setNewPlate("");
    } catch (err) { setPlatesMessage(err.message); }
  }, [fleetHeaders, newPlate, savedPlates, lookupVehicleProfile]);

  const importBulk = useCallback(async () => {
    const tokens = parsePlateTokens(bulkPlates);
    if (!tokens.length) { setPlatesMessage("No encontré patentes."); return; }
    const valid = tokens.filter(plateLooksValid);
    const toAdd = valid.filter((p) => !savedPlates.includes(p));
    const invalidCount = tokens.length - valid.length;
    const dupCount = valid.length - toAdd.length;
    for (const p of toAdd) {
      await fetch(`${defaultBackendUrl}/v1/fleet/vehicles`, {
        method: "POST", headers: fleetHeaders, body: JSON.stringify({ plate: p }),
      }).catch(() => {});
    }
    setPlatesMessage([
      `Importadas: ${toAdd.length}.`,
      invalidCount > 0 ? `Inválidas: ${invalidCount}.` : "",
      dupCount > 0 ? `Duplicadas: ${dupCount}.` : "",
    ].filter(Boolean).join(" "));
    if (toAdd.length) {
      setSavedPlates((prev) => [...prev, ...toAdd.filter((p) => !prev.includes(p))]);
      toAdd.forEach((p) => void lookupVehicleProfile(p));
    }
    setBulkPlates("");
  }, [bulkPlates, fleetHeaders, lookupVehicleProfile, savedPlates]);

  const removePlate = useCallback(async (plateValue) => {
    await fetch(`${defaultBackendUrl}/v1/fleet/vehicles/${plateValue}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${auth?.token ?? ""}` },
    }).catch(() => {});
    setSavedPlates((prev) => prev.filter((p) => p !== plateValue));
    setVehicleProfiles((prev) => { const n = { ...prev }; delete n[plateValue]; return n; });
    setVehicleProfileLoading((prev) => { const n = { ...prev }; delete n[plateValue]; return n; });
  }, [auth]);

  const clearFleet = useCallback(async () => {
    await fetch(`${defaultBackendUrl}/v1/fleet/vehicles`, {
      method: "DELETE", headers: { Authorization: `Bearer ${auth?.token ?? ""}` },
    }).catch(() => {});
    setSavedPlates([]); setVehicleProfiles({}); setVehicleProfileLoading({}); setVehicleVTVDates({});
    setPlatesMessage("Flota limpiada.");
  }, [auth]);

  const buildExcelRows = useCallback((plates) => {
    return plates.map((p) => {
      const d = vehicleProfiles[p]?.data;
      const vtv = vehicleVTVDates[p];
      return {
        Patente: p,
        Marca: d?.make ?? "",
        Modelo: d?.model ?? "",
        Año: d?.year > 0 ? d.year : "",
        Tipo: d?.type ?? "",
        Combustible: d?.fuel ?? "",
        "VTV Vencimiento": vtv ?? "",
      };
    });
  }, [vehicleProfiles, vehicleVTVDates]);

  const exportFleetExcel = useCallback(() => {
    const rows = buildExcelRows(savedPlates);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flota");
    const orgName = auth?.org?.name ?? "flota";
    XLSX.writeFile(wb, `${orgName.replace(/\s+/g, "_")}_flota.xlsx`);
  }, [savedPlates, buildExcelRows, auth]);

  const downloadFilteredExcel = useCallback((plates, filename) => {
    const rows = buildExcelRows(plates);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flota");
    XLSX.writeFile(wb, filename || "flota_filtrada.xlsx");
  }, [buildExcelRows]);

  const total = response?.data?.total ?? 0;
  const fines = response?.data?.fines ?? [];
  const totalAmount = fines.reduce((sum, f) => sum + Number(f.amount || 0), 0);
  const currency = fines[0]?.currency ?? "ARS";

  if (!auth) return <LoginPage backendUrl={defaultBackendUrl} onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-base text-ink-1">

      {/* ── Fleet drawer (fuera de cualquier padre con transform) ── */}
      {page === "patentes" && (
        <>
          {/* Backdrop */}
          <div
            className={[
              "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm",
              "transition-opacity duration-300",
              drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
            ].join(" ")}
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div
            className={[
              "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col",
              "border-l border-edge bg-layer-1 shadow-2xl shadow-black/80",
              "transition-transform duration-300 ease-in-out",
              drawerOpen ? "translate-x-0" : "translate-x-full",
            ].join(" ")}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-edge px-5 py-4">
              <p className="font-display text-sm font-bold uppercase tracking-widest text-ink-1">
                Agregar vehículos
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-edge px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-wider text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
              >
                Cerrar
              </button>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 border-b border-edge">
              {[
                { id: "single", label: "Patente" },
                { id: "bulk",   label: "Masiva"  },
                { id: "csv",    label: "CSV / Excel" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDrawerTab(id)}
                  className={[
                    "flex-1 px-3 py-3 font-display text-[10px] font-semibold uppercase tracking-widest transition-all",
                    drawerTab === id
                      ? "border-b-2 border-brand text-brand"
                      : "border-b-2 border-transparent text-ink-2 hover:text-ink-1",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {drawerTab === "single" && (
                <div className="space-y-4">
                  <FormField
                    id="fleet-plate"
                    label="Patente"
                    value={newPlate}
                    onChange={(e) => setNewPlate(normalizePlate(e.target.value))}
                    placeholder="ABC123 o AB123CD"
                    hint="Formatos válidos: ABC123 · AB123CD · 123ABC · A123BCD"
                    error={newPlateError}
                    autoComplete="off"
                  />
                  <PrimaryButton
                    onClick={addSinglePlate}
                    disabled={!newPlateNormalized || Boolean(newPlateError)}
                  >
                    Agregar
                  </PrimaryButton>
                  {platesMessage && (
                    <p className="font-display text-[10px] uppercase tracking-wider text-ink-2">{platesMessage}</p>
                  )}
                </div>
              )}

              {drawerTab === "bulk" && (
                <div className="space-y-3">
                  <p className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2">
                    Pegá las patentes separadas por coma, espacio o salto de línea.
                  </p>
                  <textarea
                    id="bulk-plates"
                    value={bulkPlates}
                    onChange={(e) => setBulkPlates(e.target.value)}
                    placeholder={"AAA000, AB123CD\nXYZ999"}
                    className={`${ui.input} min-h-32 font-mono text-xs`}
                  />
                  <button
                    type="button"
                    onClick={importBulk}
                    className="w-full rounded-xl bg-brand px-4 py-2.5 font-display text-xs font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030] active:scale-[0.98]"
                  >
                    Importar
                  </button>
                  {platesMessage && (
                    <p className="font-display text-[10px] uppercase tracking-wider text-ink-2">{platesMessage}</p>
                  )}
                  <div className="border-t border-edge pt-3">
                    <button
                      type="button"
                      onClick={clearFleet}
                      className="w-full rounded-xl border border-edge px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-danger/40 hover:text-danger"
                    >
                      Limpiar flota completa
                    </button>
                  </div>
                </div>
              )}

              {drawerTab === "csv" && (
                <PlateCSVImport
                  backendUrl={defaultBackendUrl}
                  apiKey={defaultApiKey}
                  onImport={async (plates, profiles) => {
                    const toAdd = plates.filter((p) => !savedPlates.includes(p));
                    for (const p of toAdd) {
                      const v = profiles[p] || {};
                      await fetch(`${defaultBackendUrl}/v1/fleet/vehicles`, {
                        method: "POST", headers: fleetHeaders,
                        body: JSON.stringify({ plate: p, make: v.make || "", year: v.year || 0, type: v.type || "" }),
                      }).catch(() => {});
                    }
                    setSavedPlates((prev) => [...prev, ...toAdd.filter((p) => !prev.includes(p))]);
                    setVehicleProfiles((prev) => {
                      const next = { ...prev };
                      for (const p of toAdd) if (profiles[p]) next[p] = { data: profiles[p], error: "" };
                      return next;
                    });
                    for (const p of toAdd) if (!profiles[p]?.make) void lookupVehicleProfile(p);
                    setDrawerOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Sticky navbar ───────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-edge bg-base/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 gap-4">

          {/* Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="font-display text-xl font-black uppercase tracking-[0.12em] text-brand">Kuruma</span>
            <span className="hidden rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-brand sm:inline">
              Fleet
            </span>
          </div>

          {/* Nav tabs */}
          <div className="flex min-w-0 gap-0.5 overflow-x-auto">
            {[
              ...NAV_BASE,
              ...MODULE_TABS.filter((t) => enabledModules.includes(t.module)),
              { id: "analisis", label: "Análisis" },
              { id: "settings", label: "⚙" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={[
                  "cursor-pointer rounded-lg px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-widest transition-all duration-150 shrink-0",
                  page === id
                    ? "bg-brand text-base shadow-lg shadow-brand/20"
                    : "text-ink-2 hover:text-ink-1",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Org + logout */}
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden font-display text-[11px] uppercase tracking-widest text-ink-3 sm:block">
              {auth.org.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-edge px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-danger/40 hover:text-danger"
            >
              Salir
            </button>
          </div>
        </div>
      </nav>

      {/* ── Page content ────────────────────────── */}
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8">

        {/* ── Consulta ──────────────────────────── */}
        {page === "consulta" && (
          <div className="space-y-5 fade-up">
            <section className={ui.panel}>
              <p className="mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-2">
                Jurisdicciones disponibles
              </p>
              <ArgentinaMap activeSource={source} onSelectSource={setSource} />
            </section>

            <section className={`${ui.panel} grid gap-6 md:grid-cols-3`}>
              <div className="md:col-span-2 space-y-4">
                {/* Controls row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label htmlFor="source-select" className="font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">
                      Fuente
                    </label>
                    <select
                      id="source-select"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="rounded-xl border border-edge bg-layer-2 px-3 py-2 font-display text-xs uppercase tracking-wider text-ink-1 outline-none focus:border-brand"
                    >
                      <option value="all">Todas</option>
                      <option value="caba">CABA</option>
                      <option value="pba">PBA</option>
                      <option value="cordoba">Córdoba</option>
                      <option value="entrerios">Entre Ríos</option>
                      <option value="santafe">Santa Fe</option>
                      <option value="misiones">Misiones</option>
                      <option value="corrientes">Corrientes</option>
                      <option value="chaco">Chaco</option>
                      <option value="salta">Salta</option>
                      <option value="jujuy">Jujuy</option>
                      <option value="riotercero">Río Tercero</option>
                      <option value="roquesaenzpena">Roque Sáenz Peña</option>
                      <option value="villaangostura">Villa La Angostura</option>
                      <option value="santarosa">Santa Rosa</option>
                      <option value="lomasdezamora">Lomas de Zamora</option>
                      <option value="avellaneda">Avellaneda</option>
                      <option value="almirante_brown">Almirante Brown</option>
                      <option value="escobar">Escobar</option>
                      <option value="posadas">Posadas</option>
                      <option value="venadotuerto">Venado Tuerto</option>
                      <option value="mendoza">Mendoza</option>
                      <option value="tresdefebrero">Tres de Febrero</option>
                      <option value="lamatanza">La Matanza</option>
                      <option value="tigre">Tigre</option>
                      <option value="sanmartin">San Martín</option>
                    </select>
                  </div>

                  <div className="flex rounded-xl border border-edge bg-layer-2 p-0.5">
                    {[
                      { id: "plate", label: "Patente" },
                      { id: "document", label: "DNI" },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setQueryType(id)}
                        className={[
                          "rounded-lg px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-widest transition-all",
                          queryType === id ? "bg-brand text-base" : "text-ink-2 hover:text-ink-1",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <FormField
                  id={queryType === "plate" ? "plate" : "document"}
                  label={queryType === "plate" ? "Patente" : "DNI"}
                  value={queryType === "plate" ? plate : document}
                  onChange={(e) =>
                    queryType === "plate"
                      ? setPlate(normalizePlate(e.target.value))
                      : setDocument(normalizeDocument(e.target.value))
                  }
                  placeholder={queryType === "plate" ? "ABC123 o AB123CD" : "30111222"}
                  hint={queryType === "plate" ? "Formatos: ABC123 · AB123CD · 123ABC" : "Solo números de DNI"}
                  error={queryType === "plate" ? plateError : documentError}
                  autoComplete="off"
                />
                <PrimaryButton
                  onClick={() => searchFines(activeValue, queryType)}
                  disabled={!canSearch || isLoading}
                  loading={isLoading}
                >
                  Consultar multas
                </PrimaryButton>
              </div>

              {/* Status card */}
              <div className={`${ui.card} flex flex-col justify-between`} role="status" aria-live="polite">
                <div>
                  <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-2">Estado</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${isLoading ? "bg-brand pulse-dot" : canSearch ? "bg-success" : "bg-ink-3"}`} />
                    <p className="font-display text-sm font-semibold uppercase tracking-wider text-ink-1">
                      {isLoading ? "Consultando..." : canSearch ? "Listo" : queryType === "plate" ? "Patente incompleta" : "DNI incompleto"}
                    </p>
                  </div>
                </div>
                {lastUpdatedAt && (
                  <p className="mt-4 font-mono text-[10px] text-ink-3">
                    ACTUALIZADO {lastUpdatedAt}
                  </p>
                )}
              </div>
            </section>

            <section className={ui.panel}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-lg font-bold uppercase tracking-wide text-ink-1">Resultado</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-edge px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">
                    {total} multa{total !== 1 ? "s" : ""}
                  </span>
                  {total > 0 && (
                    <span className="rounded-full border border-danger/25 bg-danger/5 px-3 py-1 font-display text-[10px] font-bold uppercase tracking-widest text-danger">
                      {currency} {totalAmount.toLocaleString("es-AR")}
                    </span>
                  )}
                </div>
              </div>
              <FineResultList fines={fines} isLoading={isLoading} error={error} hasSearched={hasSearched} />
            </section>
          </div>
        )}

        {/* ── Mi Flota ──────────────────────────── */}
        {page === "patentes" && selectedPlate && (
          <VehicleDetailPage
            key={selectedPlate}
            plate={selectedPlate}
            profile={vehicleProfiles[selectedPlate]}
            backendUrl={defaultBackendUrl}
            token={auth?.token}
            onBack={() => setSelectedPlate(null)}
            onLookupProfile={() => lookupVehicleProfile(selectedPlate)}
            profileLoading={Boolean(vehicleProfileLoading[selectedPlate])}
            vtvDueDate={vehicleVTVDates[selectedPlate] ?? null}
            onUpdateVTV={(newDate) =>
              setVehicleVTVDates((prev) => ({ ...prev, [selectedPlate]: newDate }))
            }
            enabledModules={enabledModules}
          />
        )}

        {page === "patentes" && !selectedPlate && (
          <div className="fade-up">

            {/* ── Fleet header ── */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="font-display text-lg font-bold uppercase tracking-wide text-ink-1">Mi Flota</p>
                <span className="rounded-full border border-edge-hi bg-layer-2 px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-ink-2">
                  {savedPlatesCount} vehículo{savedPlatesCount !== 1 ? "s" : ""}
                </span>
                {activeVehicleProfileLoads > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand pulse-dot" />
                    <span className="font-display text-[10px] uppercase tracking-widest text-brand">
                      {activeVehicleProfileLoads} perfil{activeVehicleProfileLoads > 1 ? "es" : ""}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex rounded-xl border border-edge bg-layer-2 p-0.5">
                  {[
                    { id: "cards", label: "Cards" },
                    { id: "table", label: "Tabla" },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setFleetView(id); localStorage.setItem("kuruma_fleet_view", id); }}
                      className={[
                        "rounded-lg px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest transition-all",
                        fleetView === id ? "bg-layer-3 text-ink-1" : "text-ink-2 hover:text-ink-1",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Export button */}
                {savedPlatesCount > 0 && (
                  <button
                    type="button"
                    onClick={exportFleetExcel}
                    className="rounded-xl border border-edge px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1 active:scale-[0.98]"
                  >
                    ↓ Excel
                  </button>
                )}
                {/* Add button */}
                <button
                  type="button"
                  onClick={() => { setDrawerTab("single"); setDrawerOpen(true); }}
                  className="rounded-xl bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030] active:scale-[0.98]"
                >
                  + Agregar
                </button>
              </div>
            </div>

            {/* ── Fleet content ── */}
            {savedPlatesCount === 0 ? (
              <div className={`${ui.card} py-16 text-center`}>
                <p className="font-display text-lg font-bold uppercase tracking-wider text-ink-3">Flota vacía</p>
                <p className="mt-2 text-sm text-ink-3">Usá el botón "Agregar" para incorporar vehículos.</p>
                <button
                  type="button"
                  onClick={() => { setDrawerTab("single"); setDrawerOpen(true); }}
                  className="mt-5 rounded-xl bg-brand px-5 py-2.5 font-display text-xs font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030]"
                >
                  + Agregar primer vehículo
                </button>
              </div>
            ) : fleetView === "cards" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedPlates.map((plateValue) => {
                  const profile = vehicleProfiles[plateValue];
                  const loading = vehicleProfileLoading[plateValue];
                  const data = profile?.data;
                  const vtv = vehicleVTVDates[plateValue];
                  const vtvDays = vtvDaysLeft(vtv);
                  const vtvUrgent = vtvDays !== null && vtvDays < 30;
                  return (
                    <div key={plateValue} onClick={() => setSelectedPlate(plateValue)} className="fade-up rounded-2xl border border-edge bg-layer-1 p-4 transition-all hover:border-edge-hi hover:border-brand/30 cursor-pointer">
                      {(() => { const st = fleetStats[plateValue]; return st && (
                        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
                          {st.driver && <span className="font-display text-[10px] uppercase tracking-wider text-brand/80">● {st.driver}</span>}
                          {enabledModules.includes("mantenimiento") && <span className="font-display text-[10px] uppercase tracking-wider text-ink-3">{st.maintenance} service{st.maintenance !== 1 ? "s" : ""}</span>}
                          {enabledModules.includes("documentos") && <span className="font-display text-[10px] uppercase tracking-wider text-ink-3">{st.documents} doc{st.documents !== 1 ? "s" : ""}</span>}
                          {enabledModules.includes("combustible") && <span className="font-display text-[10px] uppercase tracking-wider text-ink-3">{st.fuel} carga{st.fuel !== 1 ? "s" : ""}</span>}
                        </div>
                      ); })()}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <PlateBadge plate={plateValue} />
                        <div className="flex items-center gap-2">
                          {vtvUrgent && (
                            <span className="rounded-full border border-danger/40 bg-danger/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-danger">
                              VTV {vtvDays < 0 ? "vencida" : `${vtvDays}d`}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removePlate(plateValue); }}
                            className="shrink-0 rounded-lg border border-edge px-2 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 transition-all hover:border-danger/40 hover:text-danger"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                      {data && (
                        <div className="mb-3 space-y-1">
                          {data.make && (
                            <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-1">
                              {data.make} {data.model || ""}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {data.year > 0 && (
                              <span className="rounded-full border border-edge-hi px-2 py-0.5 font-mono text-[10px] text-ink-2">
                                {data.year}
                              </span>
                            )}
                            {data.type && (
                              <span className="rounded-full border border-edge-hi px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-2">
                                {data.type}
                              </span>
                            )}
                            {data.fuel && (
                              <span className="rounded-full border border-edge-hi px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-2">
                                {data.fuel}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {profile?.error && (
                        <p className="mb-2 font-display text-[10px] uppercase tracking-wider text-danger">{profile.error}</p>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); lookupVehicleProfile(plateValue); }}
                        disabled={Boolean(loading)}
                        className="w-full rounded-xl border border-edge px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="pulse-dot inline-block h-1 w-1 rounded-full bg-brand" />
                            Consultando...
                          </span>
                        ) : "Ver detalle →"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Table view */
              <div className="rounded-2xl border border-edge bg-layer-1 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2">Patente</th>
                      <th className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2 hidden sm:table-cell">Marca / Modelo</th>
                      <th className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2 hidden md:table-cell">Año</th>
                      <th className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2 hidden md:table-cell">Tipo</th>
                      {enabledModules.includes("conductores") && <th className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2 hidden lg:table-cell">Conductor</th>}
                      {(enabledModules.includes("mantenimiento") || enabledModules.includes("documentos") || enabledModules.includes("combustible")) && (
                        <th className="px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2 hidden lg:table-cell">Registros</th>
                      )}
                      <th className="px-4 py-3 text-right font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedPlates.map((plateValue, i) => {
                      const profile = vehicleProfiles[plateValue];
                      const loading = vehicleProfileLoading[plateValue];
                      const data = profile?.data;
                      const vtv = vehicleVTVDates[plateValue];
                      const vtvDays = vtvDaysLeft(vtv);
                      const vtvUrgent = vtvDays !== null && vtvDays < 30;
                      return (
                        <tr
                          key={plateValue}
                          onClick={() => setSelectedPlate(plateValue)}
                          className={[
                            "cursor-pointer transition-colors hover:bg-layer-2",
                            i < savedPlates.length - 1 ? "border-b border-edge" : "",
                          ].join(" ")}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <PlateBadge plate={plateValue} />
                              {vtvUrgent && (
                                <span className="rounded-full border border-danger/40 bg-danger/5 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-danger">
                                  VTV {vtvDays < 0 ? "vencida" : `${vtvDays}d`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            {data?.make ? (
                              <span className="font-display text-xs font-bold uppercase tracking-wide text-ink-1">
                                {data.make} {data.model || ""}
                              </span>
                            ) : (
                              <span className="font-display text-[10px] uppercase tracking-wider text-ink-3">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="font-mono text-xs text-ink-2">
                              {data?.year > 0 ? data.year : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {data?.type ? (
                              <span className="rounded-full border border-edge-hi px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-2">
                                {data.type}
                              </span>
                            ) : (
                              <span className="font-display text-[10px] uppercase tracking-wider text-ink-3">—</span>
                            )}
                          </td>
                          {enabledModules.includes("conductores") && (
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {fleetStats[plateValue]?.driver
                                ? <span className="font-display text-[10px] uppercase tracking-wider text-brand/80">{fleetStats[plateValue].driver}</span>
                                : <span className="font-display text-[10px] text-ink-3">—</span>}
                            </td>
                          )}
                          {(enabledModules.includes("mantenimiento") || enabledModules.includes("documentos") || enabledModules.includes("combustible")) && (
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="flex items-center gap-3">
                                {enabledModules.includes("mantenimiento") && (
                                  <span className="font-display text-[10px] uppercase tracking-wider text-ink-3" title="Services">
                                    {fleetStats[plateValue]?.maintenance ?? 0} svc
                                  </span>
                                )}
                                {enabledModules.includes("documentos") && (
                                  <span className="font-display text-[10px] uppercase tracking-wider text-ink-3" title="Documentos">
                                    {fleetStats[plateValue]?.documents ?? 0} doc
                                  </span>
                                )}
                                {enabledModules.includes("combustible") && (
                                  <span className="font-display text-[10px] uppercase tracking-wider text-ink-3" title="Cargas de combustible">
                                    {fleetStats[plateValue]?.fuel ?? 0} carga{(fleetStats[plateValue]?.fuel ?? 0) !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); lookupVehicleProfile(plateValue); }}
                                disabled={Boolean(loading)}
                                className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-2 transition-all hover:border-brand/40 hover:text-brand disabled:opacity-50"
                              >
                                {loading ? "..." : "Ver →"}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removePlate(plateValue); }}
                                className="rounded-lg border border-edge px-2.5 py-1 font-display text-[9px] font-semibold uppercase tracking-wider text-ink-3 transition-all hover:border-danger/40 hover:text-danger"
                              >
                                Quitar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Análisis ──────────────────────────── */}
        {page === "analisis" && (
          <AnalyticsPage
            backendUrl={defaultBackendUrl}
            token={auth?.token}
            orgId={auth?.org?.id}
            savedPlates={savedPlates}
            onDownloadExcel={downloadFilteredExcel}
          />
        )}

        {/* ── Módulos opt-in ──────────────────── */}
        {page === "conductores" && (
          <DriversPage backendUrl={defaultBackendUrl} apiKey={defaultApiKey} token={auth?.token} savedPlates={savedPlates} />
        )}
        {page === "mantenimiento" && (
          <MaintenancePage backendUrl={defaultBackendUrl} apiKey={defaultApiKey} token={auth?.token} savedPlates={savedPlates} />
        )}
        {page === "documentos" && (
          <DocumentsPage backendUrl={defaultBackendUrl} apiKey={defaultApiKey} token={auth?.token} savedPlates={savedPlates} />
        )}
        {page === "combustible" && (
          <FuelPage backendUrl={defaultBackendUrl} apiKey={defaultApiKey} token={auth?.token} savedPlates={savedPlates} />
        )}
        {page === "horario" && (
          <SchedulePage backendUrl={defaultBackendUrl} apiKey={defaultApiKey} token={auth?.token} savedPlates={savedPlates} />
        )}

        {/* ── Configuración ───────────────────── */}
        {page === "settings" && (
          <ModulesPage
            backendUrl={defaultBackendUrl}
            token={auth?.token}
            enabledModules={enabledModules}
            onModulesUpdate={handleModulesUpdate}
          />
        )}
      </div>

      {/* ── Floating assistant ──────────────────── */}
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
          chatOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        onClick={() => setChatOpen(false)}
      />

      {/* Chat panel */}
      <div
        className={[
          "fixed bottom-0 left-1/2 -translate-x-1/2 z-50 flex flex-col",
          "w-full max-w-2xl h-[85vh]",
          "border-l border-r border-t border-edge bg-layer-1 shadow-2xl shadow-black/80",
          "rounded-t-2xl transition-transform duration-300 ease-in-out",
          chatOpen ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-edge px-5 py-4">
          <div className="flex items-center gap-2.5">
            <p className="font-display text-sm font-bold uppercase tracking-widest text-ink-1">Asistente</p>
            <span className="rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-brand">
              IA · Gemini
            </span>
          </div>
          <button
            type="button"
            onClick={() => setChatOpen(false)}
            className="rounded-lg border border-edge px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-wider text-ink-2 transition-all hover:border-edge-hi hover:text-ink-1"
          >
            Cerrar
          </button>
        </div>
        {/* Chat content */}
        <div className="flex-1 min-h-0">
          <AssistantPage backendUrl={defaultBackendUrl} token={auth?.token} orgId={auth?.org?.id} embedded onDownloadExcel={downloadFilteredExcel} onAddChart={handleAddChart} />
        </div>
      </div>


      <ThemeSwitcher currentTheme={currentTheme} onThemeChange={setCurrentTheme} />
    </div>
  );
}
