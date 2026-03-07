import { useRef, useState } from "react";
import PropTypes from "prop-types";

function plateLooksValid(value) {
  return /^[A-Z]{2,3}[0-9]{3}[A-Z]{0,2}$/.test(value);
}

async function readFileAsText(file) {
  if (file.name.match(/\.(xls|xlsx)$/i)) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(sheet);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsText(file, "utf-8");
  });
}

export default function PlateCSVImport({ backendUrl, apiKey, onImport }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState([]);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    try {
      setStatus("reading");
      setMessage("Leyendo archivo...");
      setPreview([]);

      const content = await readFileAsText(file);

      setStatus("analyzing");
      setMessage("Analizando con IA...");

      const response = await fetch(`${backendUrl}/v1/external/parse-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ content }),
      });

      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error(payload?.error?.message || `Error ${response.status}`);
      }

      const rows = payload.data ?? [];
      const valid = rows.filter((r) => r?.plate && plateLooksValid(String(r.plate).toUpperCase()));
      const plates = valid.map((r) => String(r.plate).toUpperCase());
      const profiles = {};
      for (const r of valid) {
        const p = String(r.plate).toUpperCase();
        if (r.make || r.year || r.type) {
          profiles[p] = { make: r.make || "", year: r.year ? Number(r.year) : 0, type: r.type || "" };
        }
      }

      setPreview(valid);
      setStatus("done");
      setMessage(`${plates.length} ${plates.length === 1 ? "vehículo importado" : "vehículos importados"}`);
      onImport(plates, profiles);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const statusStyles = {
    idle:      { color: "text-ink-3",   dot: "" },
    reading:   { color: "text-info",    dot: "bg-info pulse-dot" },
    analyzing: { color: "text-brand",   dot: "bg-brand pulse-dot" },
    done:      { color: "text-success", dot: "bg-success" },
    error:     { color: "text-danger",  dot: "bg-danger" },
  }[status] ?? { color: "text-ink-3", dot: "" };

  return (
    <div className="mb-5 rounded-2xl border border-edge bg-layer-1 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-2">
            Importación
          </p>
          <p className="mt-0.5 font-display text-base font-bold uppercase tracking-wide text-ink-1">
            CSV / Excel con IA
          </p>
        </div>

        <label className="cursor-pointer">
          <span className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-brand transition-all hover:bg-brand/20 hover:border-brand">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 1v7M2 8l4 3 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Subir archivo
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      </div>

      {message && (
        <div className="flex items-center gap-2.5">
          {statusStyles.dot && (
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusStyles.dot}`} />
          )}
          <p className={`font-display text-xs font-medium uppercase tracking-wider ${statusStyles.color}`}>
            {message}
          </p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-edge">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-edge bg-layer-2">
                {["Patente", "Marca", "Año", "Tipo"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={r.plate} className={`border-b border-edge last:border-0 ${i % 2 ? "bg-layer-2/50" : ""}`}>
                  <td className="px-3 py-2 font-mono text-[11px] font-medium tracking-wider text-ink-1">{r.plate}</td>
                  <td className="px-3 py-2 text-ink-2">{r.make || "—"}</td>
                  <td className="px-3 py-2 text-ink-2">{r.year || "—"}</td>
                  <td className="px-3 py-2 text-ink-2">{r.type || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

PlateCSVImport.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  apiKey: PropTypes.string.isRequired,
  onImport: PropTypes.func.isRequired,
};
