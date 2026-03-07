import { useEffect, useRef, useState } from "react";

const DOWNLOAD_ACTION_RE = /(?:^|\n)ACCION_DESCARGA:(\{[^\n]+\})\s*$/;
const CHART_ACTION_RE    = /(?:^|\n)ACCION_GRAFICO:(\{[^\n]+\})\s*$/;
const TABLE_ACTION_RE    = /(?:^|\n)ACCION_TABLA:(\{[^\n]+\})\s*$/;

const SUGGESTIONS = [
  "How many vehicles are in my fleet?",
  "Which plate has the most fines?",
  "Show me a bar chart of OVR038 fines by year",
  "Give me a table of all vehicles ranked by total fines",
];

const MAX_CHATS = 30;
const MAX_MESSAGES_PER_CHAT = 100;

function chatsKey(orgId) {
  return `kuruma_chats_${orgId}`;
}

function loadChats(orgId) {
  if (!orgId) return [];
  try {
    return JSON.parse(localStorage.getItem(chatsKey(orgId)) || "[]");
  } catch {
    return [];
  }
}

function saveChats(orgId, chats) {
  if (!orgId) return;
  try {
    const trimmed = chats
      .slice(0, MAX_CHATS)
      .map((c) => ({ ...c, messages: c.messages.slice(-MAX_MESSAGES_PER_CHAT) }));
    localStorage.setItem(chatsKey(orgId), JSON.stringify(trimmed));
  } catch { /* localStorage full — silently ignore */ }
}

function newChat() {
  return {
    id: crypto.randomUUID(),
    title: "Nueva conversación",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function chatTitle(messages) {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Nueva conversación";
  return first.content.length > 38 ? first.content.slice(0, 38) + "…" : first.content;
}

function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// embedded=true → sidebar + fills 100% of parent container
export default function AssistantPage({ backendUrl, token, orgId, embedded = false, onDownloadExcel, onAddChart }) {
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [chats, setChats] = useState(() => {
    const stored = loadChats(orgId);
    return stored.length ? stored : [newChat()];
  });
  const [activeChatId, setActiveChatId] = useState(() => {
    const stored = loadChats(orgId);
    return stored.length ? stored[0].id : chats[0]?.id;
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? chats[0];
  const messages = activeChat?.messages ?? [];

  // Persist on every chats change
  useEffect(() => {
    saveChats(orgId, chats);
  }, [chats, orgId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function updateActiveMessages(updater) {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== activeChatId) return c;
        const nextMessages = typeof updater === "function" ? updater(c.messages) : updater;
        return {
          ...c,
          messages: nextMessages,
          title: chatTitle(nextMessages),
          updatedAt: Date.now(),
        };
      })
    );
  }

  function startNewChat() {
    const chat = newChat();
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setError("");
    setInput("");
    inputRef.current?.focus();
  }

  function deleteChat(id) {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        const fresh = newChat();
        setActiveChatId(fresh.id);
        return [fresh];
      }
      if (id === activeChatId) {
        setActiveChatId(next[0].id);
      }
      return next;
    });
  }

  async function handleUpgrade() {
    setCheckingOut(true);
    try {
      const res = await fetch(`${backendUrl}/v1/fleet/subscription/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload?.error?.message || "Error");
      window.open(payload.data.checkout_url, "_blank");
    } catch (err) {
      setError(err.message || "No se pudo iniciar el pago.");
    } finally {
      setCheckingOut(false);
    }
  }

  async function sendMessage(text) {
    const msg = text ?? input;
    if (!msg.trim() || loading) return;
    setInput("");
    setError("");

    const userMsg = { role: "user", content: msg };
    const nextMessages = [...messages, userMsg];
    updateActiveMessages(nextMessages);
    setLoading(true);

    try {
      const res = await fetch(`${backendUrl}/v1/fleet/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: msg, session_id: activeChatId }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        if (payload?.error?.code === "SUBSCRIPTION_REQUIRED") {
          setUpgradeRequired(true);
          updateActiveMessages(messages); // revert optimistic
          return;
        }
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

      updateActiveMessages([
        ...nextMessages,
        { role: "assistant", content: reply, downloadAction, chartAction, tableAction },
      ]);

      if (downloadAction && onDownloadExcel)
        onDownloadExcel(downloadAction.plates ?? [], downloadAction.filename ?? "flota_filtrada.xlsx");
      if (chartAction && onAddChart) {
        onAddChart({
          plate:   (chartAction.plate ?? "").toUpperCase().replace(/[-\s]/g, ""),
          type:    ["bar","line","area"].includes(chartAction.type) ? chartAction.type : "bar",
          metric:  ["count","amount"].includes(chartAction.metric) ? chartAction.metric : "count",
          groupBy: ["year","month"].includes(chartAction.groupBy) ? chartAction.groupBy : "year",
          sources: Array.isArray(chartAction.sources) && chartAction.sources.length ? chartAction.sources : ["caba","pba"],
        });
      }
    } catch (err) {
      setError(err.message || "No se pudo conectar con el asistente.");
      updateActiveMessages(messages); // revert optimistic
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

  // ── Sidebar ──────────────────────────────────────────────────────────
  const Sidebar = (
    <div className="flex w-36 shrink-0 flex-col border-r border-edge bg-layer-2 overflow-hidden">
      <div className="shrink-0 p-2 border-b border-edge">
        <button
          type="button"
          onClick={startNewChat}
          className="w-full rounded-lg border border-brand/30 bg-brand/10 py-1.5 font-display text-[9px] font-bold uppercase tracking-widest text-brand transition-all hover:bg-brand/20"
        >
          + Nuevo
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map((c) => (
          <div
            key={c.id}
            className={[
              "group relative flex flex-col gap-0.5 cursor-pointer px-2.5 py-2 transition-colors border-b border-edge",
              c.id === activeChatId
                ? "bg-layer-1 border-l-2 border-l-brand"
                : "hover:bg-layer-1",
            ].join(" ")}
            onClick={() => { setActiveChatId(c.id); setError(""); }}
          >
            <span className={[
              "block font-display text-[9px] font-semibold uppercase tracking-wide leading-tight line-clamp-2",
              c.id === activeChatId ? "text-ink-1" : "text-ink-2",
            ].join(" ")}>
              {c.title}
            </span>
            <span className="font-mono text-[8px] text-ink-3">{relTime(c.updatedAt)}</span>
            {chats.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}
                className="absolute right-1 top-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded text-ink-3 hover:text-danger transition-colors"
                title="Eliminar"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Chat panel ───────────────────────────────────────────────────────
  const ChatPanel = (
    <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0 p-3">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-6">
            <div className="text-center">
              <p className="font-display text-sm font-bold uppercase tracking-wider text-ink-2">
                How can I help you?
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink-3">
                Ask about your fleet, fines or VTV
              </p>
            </div>
            <div className="grid gap-2 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  className="rounded-xl border border-edge bg-layer-2 px-3 py-2 text-left font-display text-[9px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-brand/40 hover:text-brand"
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
                "max-w-[88%] rounded-2xl border px-3 py-2.5",
                m.role === "user"
                  ? "bg-brand/10 border-brand/20 text-ink-1"
                  : "bg-layer-2 border-edge text-ink-1",
              ].join(" ")}
            >
              {m.role === "assistant" && (
                <p className="mb-1 font-display text-[8px] font-semibold uppercase tracking-[0.2em] text-brand">
                  Asistente
                </p>
              )}
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.content}</p>
              {m.downloadAction && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/10 px-2.5 py-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span className="font-display text-[8px] font-semibold uppercase tracking-widest text-brand">
                    Excel downloaded · {(m.downloadAction.plates ?? []).length} vehicle{(m.downloadAction.plates ?? []).length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {m.chartAction && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/10 px-2.5 py-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                  </svg>
                  <span className="font-display text-[8px] font-semibold uppercase tracking-widest text-brand">
                    Chart added · {m.chartAction.plate} · Ver en Análisis →
                  </span>
                </div>
              )}
              {m.tableAction?.columns && m.tableAction?.rows && (
                <div className="mt-2 overflow-x-auto rounded-xl border border-edge">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-edge bg-layer-2">
                        {m.tableAction.columns.map((col, ci) => (
                          <th key={ci} className="px-2 py-1.5 font-display text-[8px] font-semibold uppercase tracking-widest text-ink-3">
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
                              "px-2 py-1.5 font-mono text-[10px]",
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
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-edge bg-layer-2 px-3 py-2.5">
              <p className="mb-1 font-display text-[8px] font-semibold uppercase tracking-[0.2em] text-brand">
                Asistente
              </p>
              <span className="flex items-center gap-2">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                <span className="font-display text-[9px] uppercase tracking-widest text-ink-3">
                  Pensando...
                </span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center font-display text-[9px] uppercase tracking-widest text-danger">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Upgrade wall */}
      {upgradeRequired && (
        <div className="shrink-0 border-t border-brand/30 bg-brand/5 p-4 flex flex-col items-center gap-3">
          <div className="text-center">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-brand">
              Período de prueba vencido
            </p>
            <p className="mt-1 font-mono text-[10px] text-ink-2">
              Actualizá a <span className="text-brand font-semibold">Kuruma PRO</span> por $4.999 ARS/mes para seguir usando el asistente IA.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={checkingOut}
              className="rounded-xl bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030] disabled:opacity-50"
            >
              {checkingOut ? "Redirigiendo..." : "Pagar con Mercado Pago"}
            </button>
            <button
              type="button"
              onClick={() => setError("Para el plan Business contactanos en hola@kuruma.ar")}
              className="rounded-xl border border-edge px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-2 transition-all hover:border-brand/40 hover:text-brand"
            >
              Business
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-edge p-3 space-y-1.5">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your fleet..."
            disabled={loading || upgradeRequired}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-edge bg-layer-2 px-3 py-2.5 font-mono text-xs text-ink-1 placeholder:text-ink-3 outline-none transition-all focus:border-brand disabled:opacity-50"
            style={{ minHeight: "40px", maxHeight: "100px" }}
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || upgradeRequired}
            className="shrink-0 rounded-xl bg-brand px-3 py-2.5 font-display text-[10px] font-bold uppercase tracking-widest text-base transition-all hover:bg-[#F5A030] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
        <p className="text-center font-mono text-[8px] text-ink-3">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex h-full">
        {Sidebar}
        {ChatPanel}
      </div>
    );
  }

  // Standalone (not currently used but kept for completeness)
  return (
    <div className="fade-up flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <p className="font-display text-lg font-bold uppercase tracking-wide text-ink-1">Asistente</p>
        <span className="rounded-full border border-brand/25 bg-brand/10 px-2.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-brand">
          IA · Gemini
        </span>
      </div>
      <div className="flex flex-1 min-h-0 rounded-2xl border border-edge overflow-hidden">
        {Sidebar}
        {ChatPanel}
      </div>
    </div>
  );
}
