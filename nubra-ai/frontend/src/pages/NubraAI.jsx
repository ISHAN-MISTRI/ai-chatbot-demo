import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, SendHorizontal } from "lucide-react";
import axios from "axios";
import ReportOutput from "../components/ReportOutput";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });
const createSessionId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function createSession() {
  const id = createSessionId();
  return {
    id,
    title: "New chat",
    createdAt: Date.now(),
    messages: [],
  };
}

export default function NubraAI() {
  const initialSession = createSession();
  const [tickers, setTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerOpen, setTickerOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sessions, setSessions] = useState([initialSession]);
  const [activeSessionId, setActiveSessionId] = useState(initialSession.id);

  const selectedTickerInfo = useMemo(
    () => tickers.find((item) => item.ticker === selectedTicker),
    [tickers, selectedTicker]
  );

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
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const dynamicPrompts = selectedTicker 
    ? [
        `Summarize ${selectedTicker} latest earnings`,
        `What are the key risks for ${selectedTicker}?`,
        `Provide a financial table for ${selectedTicker}`
      ]
    : [
        "Summarize latest earnings",
        "What are the key risks?",
        "Provide a financial table"
      ];

  const messages = activeSession?.messages || [];

  const updateActiveSession = (updater) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId ? { ...session, ...updater(session) } : session
      )
    );
  };

  const fetchTickers = async () => {
    const { data } = await api.get("/api/reports/tickers");
    const incoming = (data.tickers || []).filter((item) => item.ticker && item.ticker !== "UNKNOWN");
    setTickers(incoming);
    if (!selectedTicker && incoming.length > 0) {
      const first = incoming[0];
      setSelectedTicker(first.ticker);
      setSelectedQuarters(first.quarters || []);
      setTickerQuery(first.ticker);
    }
  };

  useEffect(() => {
    fetchTickers().catch((error) => {
      setStatusMessage(error?.message || "Failed to load stock scripts.");
      setTickers([]);
    });
  }, []);

  const newChat = () => {
    const next = createSession();
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    setInputValue("");
    setStatusMessage("");
  };

  const streamChat = async (userMessage) => {
    setIsStreaming(true);
    setStatusMessage("");
    updateActiveSession((session) => ({
      messages: [
        ...session.messages,
        { role: "user", content: userMessage, created_at: new Date().toISOString() },
        { role: "assistant", content: "", created_at: new Date().toISOString() },
      ],
      title: session.messages.length === 0 ? userMessage.slice(0, 45) : session.title,
    }));

    const response = await fetch(`${api.defaults.baseURL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: activeSessionId,
        user_message: userMessage,
        company_ticker: selectedTicker,
        quarters: selectedQuarters,
      }),
    });

    if (!response.ok) {
      const fallback = `Chat request failed (${response.status})`;
      let message = fallback;
      try {
        const payload = await response.json();
        if (payload?.detail) message = payload.detail;
      } catch {
        // Keep fallback.
      }
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
      const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));
      lines.forEach((line) => {
        const payload = line.replace("data: ", "");
        if (payload === "[DONE]") return;
        try {
          aggregated += JSON.parse(payload);
        } catch (e) {
          aggregated += payload;
        }
      });

      updateActiveSession((session) => {
        const nextMessages = [...session.messages];
        if (nextMessages.length > 0) {
          nextMessages[nextMessages.length - 1] = {
            ...nextMessages[nextMessages.length - 1],
            content: aggregated,
          };
        }
        return { messages: nextMessages };
      });
    }

    setIsStreaming(false);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const question = inputValue.trim();
    if (!question) return;
    if (!selectedTicker) {
      setStatusMessage("Select a stock script to start report analysis.");
      return;
    }
    setInputValue("");
    try {
      await streamChat(question);
    } catch (error) {
      updateActiveSession((session) => ({
        messages: session.messages.slice(0, -1),
      }));
      setStatusMessage(error?.message || "Failed to get response.");
      setIsStreaming(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 text-slate-900">
      <div className="mb-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Hello, Ishan</h1>
        <p className="mt-2 text-sm text-slate-500">
          <span className="font-semibold text-slate-900">SIHL</span> - your AI market companion.
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <button className="rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
              Watchlist
            </button>
            <button className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">
              Report analysis
            </button>
          </div>

          <div className="relative w-full max-w-md">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={14} className="text-slate-400" />
              <input
                value={tickerQuery}
                onChange={(event) => {
                  setTickerQuery(event.target.value);
                  setTickerOpen(true);
                }}
                onFocus={() => setTickerOpen(true)}
                placeholder="Search stock script (e.g. TATASTEEL)"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setTickerOpen((open) => !open)}
                className="text-slate-400"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            {tickerOpen && (
              <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                {filteredTickers.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">No stock scripts found</div>
                ) : (
                  filteredTickers.map((item) => (
                    <button
                      key={item.ticker}
                      type="button"
                      onClick={() => {
                        setSelectedTicker(item.ticker);
                        setSelectedQuarters(item.quarters || []);
                        setTickerQuery(item.ticker);
                        setTickerOpen(false);
                      }}
                      className={`mb-1 w-full rounded-xl px-3 py-2 text-left text-sm ${
                        item.ticker === selectedTicker
                          ? "bg-indigo-50 font-semibold text-indigo-700"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {item.ticker}
                      {item.company_name ? (
                        <span className="ml-2 text-xs font-normal text-slate-500">{item.company_name}</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {selectedTickerInfo?.quarters?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedTickerInfo.quarters.map((quarter) => {
              const active = selectedQuarters.includes(quarter);
              return (
                <button
                  key={quarter}
                  type="button"
                  onClick={() =>
                    setSelectedQuarters((prev) =>
                      prev.includes(quarter) ? prev.filter((q) => q !== quarter) : [...prev, quarter]
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    active ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {quarter}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-2 overflow-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveSessionId(session.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                session.id === activeSessionId
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {session.title}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={newChat}
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
        >
          + New chat
        </button>
      </div>

      {statusMessage ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {statusMessage}
        </div>
      ) : null}

      <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Search size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Start your analysis</h3>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              Select a stock from the top bar and ask any question, or choose a predefined question below.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, idx) => (
              <div key={`${message.role}-${idx}`}>
                {message.role === "user" ? (
                  <div className="ml-auto max-w-3xl rounded-2xl bg-indigo-600 px-4 py-2 text-sm text-white">
                    {message.content}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <ReportOutput response={message.content || "..."} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex gap-3">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          className="h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          placeholder="Ask SIHL about selected stock report..."
        />
        <button
          disabled={isStreaming}
          className="flex h-12 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white disabled:bg-indigo-300"
        >
          <SendHorizontal size={15} />
          {isStreaming ? "Thinking..." : "Send"}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {dynamicPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setInputValue(prompt)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-medium text-slate-600 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
