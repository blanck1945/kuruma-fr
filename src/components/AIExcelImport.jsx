import { useRef, useState } from "react";
import PropTypes from "prop-types";

async function toCSV(res, url) {
  if (url.match(/\.xlsx?$/i)) {
    const XLSX = await import("xlsx");
    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(sheet);
  }
  return res.text();
}

/** Call this from a button click handler (not useEffect) to avoid StrictMode double-run. */
export async function runMockImport(backendUrl, apiKey, endpoint, mockUrl, validate) {
  const res = await fetch(mockUrl);
  if (!res.ok) throw new Error(`No se pudo cargar el archivo de prueba (${res.status})`);
  const content = await toCSV(res, mockUrl);
  const response = await fetch(`${backendUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ content }),
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false)
    throw new Error(payload?.error?.message || `Error ${response.status}`);
  return (payload.data ?? []).filter(validate);
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

/**
 * Generic AI-powered Excel/CSV importer.
 *
 * Props:
 *   backendUrl  — base backend URL
 *   apiKey      — X-API-Key for external endpoints
 *   endpoint    — path, e.g. "/v1/external/parse-maintenance-csv"
 *   columns     — [{ key: string, label: string }] for the preview table
 *   validate    — (row) => boolean — keep only rows that pass
 *   onImport    — (rows) => void — called after AI parsing with valid rows
 *   mockFile    — optional path to a sample CSV for download (e.g. "/mocks/mantenimiento.csv")
 */
export default function AIExcelImport({
  backendUrl,
  apiKey,
  endpoint,
  columns,
  validate,
  onImport,
  mockFile,
}) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState([]);
  const inputRef = useRef(null);

  async function processContent(content) {
    setStatus("analyzing");
    setMessage("Analizando con IA...");

    const response = await fetch(`${backendUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ content }),
    });

    const payload = await response.json();
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || `Error ${response.status}`);
    }

    const rows = (payload.data ?? []).filter(validate);
    setPreview(rows);
    setStatus("done");
    setMessage(`${rows.length} fila${rows.length !== 1 ? "s" : ""} encontrada${rows.length !== 1 ? "s" : ""}`);
    onImport(rows);
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      setStatus("reading");
      setMessage("Leyendo archivo...");
      setPreview([]);
      const content = await readFileAsText(file);
      await processContent(content);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const style = {
    idle:      { color: "text-ink-3",  dot: "" },
    reading:   { color: "text-info",   dot: "bg-info pulse-dot" },
    analyzing: { color: "text-brand",  dot: "bg-brand pulse-dot" },
    done:      { color: "text-ok",     dot: "bg-ok" },
    error:     { color: "text-danger", dot: "bg-danger" },
  }[status] ?? { color: "text-ink-3", dot: "" };

  return (
    <div className="rounded-2xl border border-edge bg-layer-1 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-2">Importación</p>
          <p className="mt-0.5 font-display text-base font-bold uppercase tracking-wide text-ink-1">CSV / Excel con IA</p>
          {mockFile && (
            <a
              href={mockFile}
              download
              className="mt-1 inline-block font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3 hover:text-ink-2"
            >
              Descargar ejemplo
            </a>
          )}
        </div>

        <label className="cursor-pointer shrink-0">
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
          {style.dot && <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />}
          <p className={`font-display text-xs font-medium uppercase tracking-wider ${style.color}`}>{message}</p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-edge">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-edge bg-layer-2">
                {columns.map(({ key, label }) => (
                  <th key={key} className="px-3 py-2 text-left font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 whitespace-nowrap">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className={`border-b border-edge last:border-0 ${i % 2 ? "bg-layer-2/50" : ""}`}>
                  {columns.map(({ key }) => (
                    <td key={key} className="px-3 py-2 font-mono text-[11px] text-ink-2 whitespace-nowrap">
                      {row[key] != null && row[key] !== "" ? String(row[key]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

AIExcelImport.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  apiKey: PropTypes.string.isRequired,
  endpoint: PropTypes.string.isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.string })).isRequired,
  validate: PropTypes.func.isRequired,
  onImport: PropTypes.func.isRequired,
  mockFile: PropTypes.string,
};
