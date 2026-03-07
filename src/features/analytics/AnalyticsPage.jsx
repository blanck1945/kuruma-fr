import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const DOWNLOAD_ACTION_RE = /(?:^|\n)ACCION_DESCARGA:(\{[^\n]+\})\s*$/;
const CHART_ACTION_RE    = /(?:^|\n)ACCION_GRAFICO:(\{[^\n]+\})\s*$/;
const TABLE_ACTION_RE    = /(?:^|\n)ACCION_TABLA:(\{[^\n]+\})\s*$/;

const SUGGESTIONS = [
  "Mostrame un gráfico de barras de las multas de OVR038 por año",
  "¿Qué patente tiene más multas en CABA?",
  "Dame una tabla de todos los vehículos ordenados por multas totales",
  "Descargá los vehículos con multas en PBA",
];

function loadAnalyticsMessages(orgId) {
  if (!orgId) return [];
  try {
    return JSON.parse(localStorage.getItem(`flota_analytics_${orgId}`) || "[]");
  } catch { return []; }
}

function saveAnalyticsMessages(orgId, messages) {
  if (!orgId) return;
  try {
    // keep last 100 messages, strip chartAction to avoid huge blobs
    const trimmed = messages.slice(-100).map(({ chartAction, ...rest }) => rest);
    localStorage.setItem(`flota_analytics_${orgId}`, JSON.stringify(trimmed));
  } catch { /* localStorage full */ }
}

const SOURCES = [
  { id: "caba",      label: "CABA",       color: "#E8931A" },
  { id: "pba",       label: "PBA",        color: "#60A5FA" },
  { id: "cordoba",   label: "Córdoba",    color: "#34D399" },
  { id: "santafe",   label: "Santa Fe",   color: "#A78BFA" },
  { id: "mendoza",   label: "Mendoza",    color: "#F87171" },
  { id: "entrerios", label: "Entre Ríos", color: "#2DD4BF" },
];

const SOURCE_MAP = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

const CHART_TYPES = [
  { id: "bar",  label: "Barras" },
  { id: "line", label: "Líneas" },
  { id: "area", label: "Área" },
];

const METRICS = [
  { id: "count",  label: "Cantidad de multas" },
  { id: "amount", label: "Importe (ARS)" },
];

const GROUP_BY = [
  { id: "year",  label: "Año" },
  { id: "month", label: "Mes" },
];

function buildKey(fine, groupBy) {
  if (!fine.issued_at) return null;
  const d = new Date(fine.issued_at);
  if (isNaN(d.getTime())) return null;
  if (groupBy === "year") return String(d.getFullYear());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function aggregateFines(allFines, groupBy, metric) {
  // allFines: [{source, fines:[]}]
  const buckets = {}; // key → { [source]: value }
  for (const { source, fines } of allFines) {
    for (const fine of fines) {
      const key = buildKey(fine, groupBy);
      if (!key) continue;
      if (!buckets[key]) buckets[key] = {};
      if (!buckets[key][source]) buckets[key][source] = 0;
      buckets[key][source] += metric === "amount" ? Number(fine.amount || 0) : 1;
    }
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => ({ key, ...vals }));
}

function CustomTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-xl border border-edge-hi bg-layer-2 px-4 py-3 shadow-xl shadow-black/60 text-xs">
      <p className="mb-2 font-display font-bold uppercase tracking-widest text-ink-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-2">{SOURCE_MAP[p.dataKey]?.label ?? p.dataKey}</span>
          </span>
          <span className="font-mono font-semibold text-ink-1">
            {metric === "amount"
              ? `$${Number(p.value).toLocaleString("es-AR")}`
              : p.value}
          </span>
        </div>
      ))}
      <div className="mt-2 border-t border-edge pt-2 flex justify-between">
        <span className="text-ink-3">Total</span>
        <span className="font-mono font-bold text-brand">
          {metric === "amount"
            ? `$${total.toLocaleString("es-AR")}`
            : total}
        </span>
      </div>
    </div>
  );
}

function ChartCard({ chart, onRemove, backendUrl, token, savedPlates }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawData, setRawData] = useState(null); // [{source, fines:[]}]

  const fetch_ = useCallback(async () => {
    if (!chart.plate) return;
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        chart.sources.map(async (src) => {
          const res = await fetch(
            `${backendUrl}/v1/fleet/vehicles/${chart.plate}/fines?source=${src}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const payload = await res.json();
          if (!res.ok || payload.success === false)
            throw new Error(payload?.error?.message || `Error ${res.status}`);
          return { source: src, fines: payload.data?.fines ?? [] };
        }),
      );
      setRawData(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [chart.plate, chart.sources, backendUrl, token]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const chartData = useMemo(
    () => (rawData ? aggregateFines(rawData, chart.groupBy, chart.metric) : []),
    [rawData, chart.groupBy, chart.metric],
  );

  const totalFines = useMemo(
    () => rawData?.reduce((s, { fines }) => s + fines.length, 0) ?? 0,
    [rawData],
  );

  const totalAmount = useMemo(
    () =>
      rawData
        ?.flatMap(({ fines }) => fines)
        .reduce((s, f) => s + Number(f.amount || 0), 0) ?? 0,
    [rawData],
  );

  const activeSources = chart.sources.filter((s) =>
    rawData?.some(({ source, fines }) => source === s && fines.length > 0),
  );

  function renderChart() {
    const commonProps = {
      data: chartData,
      margin: { top: 8, right: 8, left: 0, bottom: 0 },
    };
    const axisProps = {
      tick: { fill: "#7A7890", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" },
    };
    const gridProps = { stroke: "#1C1C2E", strokeDasharray: "3 3" };

    const seriesKeys = chart.sources;

    if (chart.type === "line") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="key" {...axisProps} />
          <YAxis {...axisProps} width={48} />
          <Tooltip content={<CustomTooltip metric={chart.metric} />} />
          <Legend formatter={(v) => SOURCE_MAP[v]?.label ?? v} wrapperStyle={{ fontSize: 10 }} />
          {seriesKeys.map((s) => (
            <Line
              key={s} type="monotone" dataKey={s}
              stroke={SOURCE_MAP[s]?.color} strokeWidth={2}
              dot={{ r: 3, fill: SOURCE_MAP[s]?.color }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      );
    }
    if (chart.type === "area") {
      return (
        <AreaChart {...commonProps}>
          <defs>
            {seriesKeys.map((s) => (
              <linearGradient key={s} id={`grad-${s}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SOURCE_MAP[s]?.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SOURCE_MAP[s]?.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="key" {...axisProps} />
          <YAxis {...axisProps} width={48} />
          <Tooltip content={<CustomTooltip metric={chart.metric} />} />
          <Legend formatter={(v) => SOURCE_MAP[v]?.label ?? v} wrapperStyle={{ fontSize: 10 }} />
          {seriesKeys.map((s) => (
            <Area
              key={s} type="monotone" dataKey={s}
              stroke={SOURCE_MAP[s]?.color} fill={`url(#grad-${s})`} strokeWidth={2}
            />
          ))}
        </AreaChart>
      );
    }
    // default: bar (stacked)
    return (
      <BarChart {...commonProps}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="key" {...axisProps} />
        <YAxis {...axisProps} width={48} />
        <Tooltip content={<CustomTooltip metric={chart.metric} />} />
        <Legend formatter={(v) => SOURCE_MAP[v]?.label ?? v} wrapperStyle={{ fontSize: 10 }} />
        {seriesKeys.map((s) => (
          <Bar key={s} dataKey={s} stackId="a" fill={SOURCE_MAP[s]?.color} radius={[0, 0, 0, 0]} />
        ))}
      </BarChart>
    );
  }

  return (
    <div className="rounded-2xl border border-edge bg-layer-1 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between gap-4 border-b border-edge px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-xs font-bold uppercase tracking-widest text-ink-1">
            {chart.plate}
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            {chart.sources.map((s) => (
              <span
                key={s}
                className="rounded-full px-2 py-0.5 font-display text-[9px] font-semibold uppercase tracking-widest border"
                style={{
                  color: SOURCE_MAP[s]?.color,
                  borderColor: `${SOURCE_MAP[s]?.color}40`,
                  background: `${SOURCE_MAP[s]?.color}10`,
                }}
              >
                {SOURCE_MAP[s]?.label}
              </span>
            ))}
          </span>
          <span className="rounded-full border border-edge px-2 py-0.5 font-display text-[9px] font-semibold uppercase tracking-widest text-ink-3">
            {CHART_TYPES.find((t) => t.id === chart.type)?.label}
            {" · "}
            {GROUP_BY.find((g) => g.id === chart.groupBy)?.label}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {rawData && (
            <span className="font-mono text-[10px] text-ink-3">
              {totalFines} multa{totalFines !== 1 ? "s" : ""}
              {chart.metric === "amount" && totalAmount > 0 && (
                <> · ${totalAmount.toLocaleString("es-AR")}</>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-edge px-2 py-1 font-display text-[9px] font-semibold uppercase tracking-widest text-ink-3 transition-all hover:border-danger/40 hover:text-danger"
          >
            Quitar
          </button>
        </div>
      </div>

      {/* Chart area */}
      <div className="p-5">
        {loading && (
          <div className="flex h-52 items-center justify-center gap-2">
            <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-brand" />
            <span className="font-display text-[10px] uppercase tracking-widest text-ink-3">
              Consultando multas…
            </span>
          </div>
        )}
        {!loading && error && (
          <div className="flex h-52 items-center justify-center">
            <p className="font-display text-[10px] uppercase tracking-widest text-danger">{error}</p>
          </div>
        )}
        {!loading && !error && chartData.length === 0 && rawData && (
          <div className="flex h-52 items-center justify-center flex-col gap-2">
            <p className="font-display text-sm font-bold uppercase tracking-wider text-ink-3">Sin multas</p>
            <p className="font-mono text-[10px] text-ink-3">No hay datos para las fuentes seleccionadas</p>
          </div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={260}>
              {renderChart()}
            </ResponsiveContainer>
            {/* Data table */}
            <details className="mt-4">
              <summary className="cursor-pointer font-display text-[10px] font-semibold uppercase tracking-widest text-ink-3 hover:text-ink-2 transition-colors select-none">
                Ver datos
              </summary>
              <div className="mt-3 overflow-x-auto rounded-xl border border-edge">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-edge bg-layer-2">
                      <th className="px-3 py-2 font-display text-[9px] font-semibold uppercase tracking-widest text-ink-3">
                        {GROUP_BY.find((g) => g.id === chart.groupBy)?.label}
                      </th>
                      {chart.sources.map((s) => (
                        <th key={s} className="px-3 py-2 font-display text-[9px] font-semibold uppercase tracking-widest" style={{ color: SOURCE_MAP[s]?.color }}>
                          {SOURCE_MAP[s]?.label}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-display text-[9px] font-semibold uppercase tracking-widest text-brand">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row) => {
                      const total = chart.sources.reduce((s, src) => s + (row[src] || 0), 0);
                      return (
                        <tr key={row.key} className="border-b border-edge last:border-0 hover:bg-layer-2 transition-colors">
                          <td className="px-3 py-2 font-mono text-xs text-ink-2">{row.key}</td>
                          {chart.sources.map((s) => (
                            <td key={s} className="px-3 py-2 font-mono text-xs text-ink-1">
                              {row[s]
                                ? chart.metric === "amount"
                                  ? `$${Number(row[s]).toLocaleString("es-AR")}`
                                  : row[s]
                                : "—"}
                            </td>
                          ))}
                          <td className="px-3 py-2 font-mono text-xs font-bold text-brand">
                            {chart.metric === "amount"
                              ? `$${total.toLocaleString("es-AR")}`
                              : total}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage({ backendUrl, token, orgId, savedPlates, onDownloadExcel }) {
  const [messages, setMessages] = useState(() => loadAnalyticsMessages(orgId));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    saveAnalyticsMessages(orgId, messages);
  }, [messages, orgId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text) {
    const msg = text ?? input;
    if (!msg.trim() || loading) return;
    setInput("");
    setError("");

    const userMsg = { role: "user", content: msg };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.content?.trim())
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content,
        }));
      const res = await fetch(`${backendUrl}/v1/fleet/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: msg, history }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || `Error ${res.status}`);
      }
      let reply = payload.data.reply;
      let downloadAction = null, chartAction = null, tableAction = null;
      let m;

      if ((m = reply.match(CHART_ACTION_RE))) {
        reply = reply.slice(0, m.index).trim();
        try { chartAction = JSON.parse(m[1]); } catch { /* ignore */ }
      } else if ((m = reply.match(DOWNLOAD_ACTION_RE))) {
        reply = reply.slice(0, m.index).trim();
        try { downloadAction = JSON.parse(m[1]); } catch { /* ignore */ }
      } else if ((m = reply.match(TABLE_ACTION_RE))) {
        reply = reply.slice(0, m.index).trim();
        try { tableAction = JSON.parse(m[1]); } catch { /* ignore */ }
      }

      setMessages([...nextMessages, { role: "assistant", content: reply, downloadAction, chartAction, tableAction }]);

      if (downloadAction && onDownloadExcel)
        onDownloadExcel(downloadAction.plates ?? [], downloadAction.filename ?? "flota_filtrada.xlsx");
    } catch (err) {
      setError(err.message || "No se pudo conectar con el asistente.");
      setMessages(messages);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="fade-up flex flex-col min-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <p className="font-display text-lg font-bold uppercase tracking-wide text-ink-1">Análisis</p>
        <span className="rounded-full border border-brand/25 bg-brand/10 px-2.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-brand">
          IA · Gemini
        </span>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-5 py-6">
            <div className="text-center">
              <p className="font-display text-sm font-bold uppercase tracking-wider text-ink-2">
                ¿Qué querés analizar?
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink-3">
                Pedí gráficos, tablas o descargas en lenguaje natural
              </p>
            </div>
            <div className="grid gap-2 w-full max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  className="rounded-xl border border-edge bg-layer-2 px-4 py-2.5 text-left font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-brand/40 hover:text-brand"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={["flex", m.role === "user" ? "justify-end" : "justify-start"].join(" ")}
          >
            <div
              className={[
                "rounded-2xl border px-4 py-3",
                m.role === "user"
                  ? "max-w-[75%] bg-brand/10 border-brand/20 text-ink-1"
                  : "w-full bg-layer-2 border-edge text-ink-1",
              ].join(" ")}
            >
              {m.role === "assistant" && (
                <p className="mb-1.5 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-brand">
                  Asistente
                </p>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>

              {/* Inline chart */}
              {m.chartAction && (
                <div className="mt-3 w-full">
                  <ChartCard
                    chart={{
                      id: 0,
                      plate:   (m.chartAction.plate ?? "").toUpperCase().replace(/[-\s]/g, ""),
                      type:    ["bar","line","area"].includes(m.chartAction.type) ? m.chartAction.type : "bar",
                      metric:  ["count","amount"].includes(m.chartAction.metric) ? m.chartAction.metric : "count",
                      groupBy: ["year","month"].includes(m.chartAction.groupBy) ? m.chartAction.groupBy : "year",
                      sources: Array.isArray(m.chartAction.sources) && m.chartAction.sources.length
                        ? m.chartAction.sources : ["caba","pba"],
                    }}
                    onRemove={() => {}}
                    backendUrl={backendUrl}
                    token={token}
                    savedPlates={savedPlates}
                  />
                </div>
              )}

              {/* Inline table */}
              {m.tableAction?.columns && m.tableAction?.rows && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-edge">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-edge bg-layer-2">
                        {m.tableAction.columns.map((col, ci) => (
                          <th key={ci} className="px-3 py-2 font-display text-[9px] font-semibold uppercase tracking-widest text-ink-3">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.tableAction.rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-edge last:border-0 hover:bg-layer-2 transition-colors">
                          {row.map((cell, ci) => (
                            <td key={ci} className={[
                              "px-3 py-2 font-mono text-xs",
                              ci === 0 ? "text-ink-2" : "text-ink-1",
                              ci === row.length - 1 ? "font-bold text-brand" : "",
                            ].join(" ")}>
                              {typeof cell === "number" ? cell.toLocaleString("es-AR") : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Download badge */}
              {m.downloadAction && (
                <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/10 px-3 py-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-brand">
                    Excel descargado · {(m.downloadAction.plates ?? []).length} vehículo{(m.downloadAction.plates ?? []).length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-edge bg-layer-2 px-4 py-3">
              <p className="mb-1.5 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-brand">
                Asistente
              </p>
              <span className="flex items-center gap-2">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                <span className="font-display text-[10px] uppercase tracking-widest text-ink-3">
                  Pensando...
                </span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center font-display text-[10px] uppercase tracking-widest text-danger">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="mt-3 flex gap-2 shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pedí un gráfico, tabla o descarga..."
          disabled={loading}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-edge bg-layer-2 px-4 py-3 font-mono text-sm text-ink-1 placeholder:text-ink-3 outline-none transition-all focus:border-brand disabled:opacity-50"
          style={{ minHeight: "48px", maxHeight: "120px" }}
        />
        <button
          type="button"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="shrink-0 rounded-xl bg-brand px-4 py-3 font-display text-xs font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
      <p className="mt-1.5 text-center font-mono text-[9px] text-ink-3">
        Enter para enviar · Shift+Enter para nueva línea
      </p>
    </div>
  );
}
