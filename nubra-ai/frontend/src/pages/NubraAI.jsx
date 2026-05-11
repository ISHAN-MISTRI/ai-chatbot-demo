import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, SendHorizontal, Zap } from "lucide-react";
import axios from "axios";
import ReportOutput from "../components/ReportOutput";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });
const createSessionId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function createSession() {
  const id = createSessionId();
  return { id, title: "New chat", createdAt: Date.now(), messages: [] };
}

export default function NubraAI() {
  const initialSession = createSession();
  const [tickers, setTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedTickerName, setSelectedTickerName] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerOpen, setTickerOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sessions, setSessions] = useState([initialSession]);
  const [activeSessionId, setActiveSessionId] = useState(initialSession.id);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const filteredTickers = useMemo(() => {
    const query = tickerQuery.trim().toLowerCase();
    if (!query) return tickers;
    return tickers.filter(
      (item) =>
        item.ticker.toLowerCase().includes(query) ||
        (item.company_name || "").toLowerCase().includes(query)
    );
  }, [tickers, tickerQuery]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const messages = activeSession?.messages || [];

  // Quick prompts — dynamic based on selected ticker
  const quickPrompts = selectedTicker
    ? [
      `Summarize ${selectedTicker} earnings for FY2025`,
      `What are the key risks for ${selectedTicker}?`,
      `Give me a financial table for ${selectedTicker}`,
    ]
    : [
      "Summarize earnings for FY2025",
      "What are the key risks?",
      "Give me a financial performance table",
    ];

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateActiveSession = (updater) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, ...updater(s) } : s))
    );
  };

  const fetchTickers = async () => {
    const { data } = await api.get("/api/reports/tickers");
    const incoming = (data.tickers || []).filter((t) => t.ticker && t.ticker !== "UNKNOWN");
    setTickers(incoming);
    if (!selectedTicker && incoming.length > 0) {
      const first = incoming[0];
      setSelectedTicker(first.ticker);
      setSelectedTickerName(first.company_name || first.ticker);
      setTickerQuery(first.ticker);
    }
  };

  useEffect(() => {
    fetchTickers().catch((err) => {
      setStatusMessage(err?.message || "Failed to load stock scripts.");
      setTickers([]);
    });
  }, []);

  const newChat = () => {
    const next = createSession();
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    setInputValue("");
    setStatusMessage("");
    inputRef.current?.focus();
  };

  const streamChat = async (userMessage) => {
    setIsStreaming(true);
    setStatusMessage("");

    updateActiveSession((s) => ({
      messages: [
        ...s.messages,
        { role: "user", content: userMessage, created_at: new Date().toISOString() },
        { role: "assistant", content: "", created_at: new Date().toISOString() },
      ],
      title: s.messages.length === 0 ? userMessage.slice(0, 42) : s.title,
    }));

    // Always send quarters: [] → backend uses ALL periods (no filter applied)
    // The retrieval layer automatically does balanced per-year sampling for summary queries
    const response = await fetch(`${api.defaults.baseURL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: activeSessionId,
        user_message: userMessage,
        company_ticker: selectedTicker,
        quarters: [],
      }),
    });

    if (!response.ok) {
      let message = `Chat request failed (${response.status})`;
      try {
        const payload = await response.json();
        if (payload?.detail) message = payload.detail;
      } catch { /* keep fallback */ }
      throw new Error(message);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("Streaming failed");

    let aggregated = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
      lines.forEach((line) => {
        const payload = line.replace("data: ", "");
        if (payload === "[DONE]") return;
        try { aggregated += JSON.parse(payload); }
        catch { aggregated += payload; }
      });

      updateActiveSession((s) => {
        const next = [...s.messages];
        if (next.length > 0) {
          next[next.length - 1] = { ...next[next.length - 1], content: aggregated };
        }
        return { messages: next };
      });
    }

    setIsStreaming(false);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const question = inputValue.trim();
    if (!question) return;
    if (!selectedTicker) {
      setStatusMessage("Select a stock to start analysis.");
      return;
    }
    setInputValue("");
    try {
      await streamChat(question);
    } catch (error) {
      updateActiveSession((s) => ({ messages: s.messages.slice(0, -1) }));
      setStatusMessage(error?.message || "Failed to get response.");
      setIsStreaming(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest("[data-ticker-dropdown]")) setTickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    // Full-viewport flex column — header fixed, messages scroll, footer fixed
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900">

      {/* ═══════════════════════════════════════════
          STICKY HEADER
      ═══════════════════════════════════════════ */}
      <header className="z-20 border-b border-slate-200 bg-white shadow-sm">
        {/* Top row: branding + ticker selector */}
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">

          {/* Left: brand + nav pills */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="shrink-0">
              <div className="text-[15px] font-bold text-slate-900 leading-tight">Hello, Ishan</div>
              <div className="text-[11px] text-slate-400 leading-tight">
                <span className="font-semibold text-indigo-600">SIHL</span> · AI market companion
              </div>
            </div>
            <div className="hidden sm:flex gap-1.5 shrink-0">
              <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
                Watchlist
              </button>
              <button className="rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white">
                Report analysis
              </button>
            </div>
          </div>

          {/* Right: ticker search */}
          <div className="relative w-56 shrink-0" data-ticker-dropdown>
            <div
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer hover:border-indigo-300 transition-colors"
              onClick={() => setTickerOpen((o) => !o)}
            >
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                value={tickerQuery}
                onChange={(e) => { setTickerQuery(e.target.value); setTickerOpen(true); }}
                onFocus={() => setTickerOpen(true)}
                placeholder="Search stock…"
                className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-400 placeholder:font-normal"
                onClick={(e) => e.stopPropagation()}
              />
              <ChevronDown
                size={14}
                className={`text-slate-400 shrink-0 transition-transform ${tickerOpen ? "rotate-180" : ""}`}
              />
            </div>

            {tickerOpen && (
              <div className="absolute right-0 z-30 mt-2 max-h-60 w-64 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                {filteredTickers.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">No stock scripts found</div>
                ) : (
                  filteredTickers.map((item) => (
                    <button
                      key={item.ticker}
                      type="button"
                      onClick={() => {
                        setSelectedTicker(item.ticker);
                        setSelectedTickerName(item.company_name || item.ticker);
                        setTickerQuery(item.ticker);
                        setTickerOpen(false);
                      }}
                      className={`mb-0.5 w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${item.ticker === selectedTicker
                        ? "bg-indigo-50 font-semibold text-indigo-700"
                        : "text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                      <span className="font-medium">{item.ticker}</span>
                      {item.company_name ? (
                        <span className="ml-2 text-[11px] font-normal text-slate-500">{item.company_name}</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom row: session tabs */}
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pb-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSessionId(s.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition-colors shrink-0 ${s.id === activeSessionId
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600"
                  }`}
              >
                {s.title}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={newChat}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
          >
            + New chat
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════
          SCROLLABLE MESSAGES AREA
      ═══════════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-5">

          {/* Status / error banner */}
          {statusMessage && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              {statusMessage}
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
                <Zap size={30} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Start your analysis</h3>
              <p className="mt-2 max-w-xs text-sm text-slate-500 leading-relaxed">
                {selectedTicker
                  ? `Ask anything about ${selectedTicker} — summaries, financials, risks, and more.`
                  : "Select a stock from the top bar and ask any question."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message, idx) => (
                <div key={`${message.role}-${idx}`}>
                  {message.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <ReportOutput response={message.content || "…"} />
                    </div>
                  )}
                </div>
              ))}
              {/* Sentinel for auto-scroll */}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* ═══════════════════════════════════════════
          STICKY FOOTER — INPUT + QUICK PROMPTS
      ═══════════════════════════════════════════ */}
      <footer className="z-20 border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-4xl px-4 pt-3 pb-4">

          {/* Input form */}
          <form onSubmit={onSubmit} className="flex gap-2.5">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder={
                selectedTicker
                  ? `Ask about ${selectedTicker}…`
                  : "Select a stock and ask a question…"
              }
            />
            <button
              type="submit"
              disabled={isStreaming || !inputValue.trim()}
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              <SendHorizontal size={15} />
              {isStreaming ? "Thinking…" : "Send"}
            </button>
          </form>

          {/* Quick prompt chips */}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => { setInputValue(prompt); inputRef.current?.focus(); }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11.5px] font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
