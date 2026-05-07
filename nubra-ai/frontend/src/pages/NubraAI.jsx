import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import WelcomeScreen from "../components/WelcomeScreen";
import ChatArea from "../components/ChatArea";
import ChatInput from "../components/ChatInput";
import UploadModal from "../components/UploadModal";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

const createSessionId = () =>
  `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

function normalizeHistory(history) {
  return history.flatMap((entry) => [
    { role: "user", content: entry.user_message },
    { role: "assistant", content: entry.ai_response },
  ]);
}

export default function NubraAI() {
  const [sessionId, setSessionId] = useState(createSessionId);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [tickers, setTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadCompleted, setUploadCompleted] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [tickerOpen, setTickerOpen] = useState(false);
  const [quarterOpen, setQuarterOpen] = useState(false);

  const currentTitle = "Financial report copilot";
  const username = "Gadhvi";

  const fetchTickers = async () => {
    try {
      const { data } = await api.get("/api/reports/tickers");
      setTickers(data.tickers || []);
      if (!selectedTicker && data.tickers?.length) {
        setSelectedTicker(data.tickers[0].ticker);
        setSelectedQuarters(data.tickers[0].quarters.slice(0, 3));
      }
    } catch {
      setTickers([]);
    }
  };

  useEffect(() => {
    fetchTickers();
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchHistory() {
      try {
        const { data } = await api.get(`/api/chat/history/${sessionId}`);
        if (active) setMessages(normalizeHistory(data.history || []));
      } catch {
        if (active) setMessages([]);
      }
    }
    fetchHistory();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const handleTickerSelect = (ticker) => {
    setSelectedTicker(ticker);
    const matched = tickers.find((item) => item.ticker === ticker);
    setSelectedQuarters(matched?.quarters.slice(0, 3) || []);
    setTickerOpen(false);
  };

  const handleQuarterToggle = (quarter) => {
    setSelectedQuarters((previous) =>
      previous.includes(quarter)
        ? previous.filter((item) => item !== quarter)
        : [...previous, quarter]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!inputValue.trim() || !selectedTicker || selectedQuarters.length === 0) return;

    const userMessage = inputValue.trim();
    setMessages((previous) => [...previous, { role: "user", content: userMessage }]);
    setInputValue("");
    setLoading(true);

    try {
      const { data } = await api.post("/api/chat", {
        user_message: userMessage,
        company_ticker: selectedTicker,
        quarters: selectedQuarters,
        session_id: sessionId,
      });
      setMessages((previous) => [...previous, { role: "assistant", content: data.response }]);
    } catch (error) {
      const detail =
        error?.response?.data?.detail || "The report could not be analyzed right now.";
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `➤ ${selectedTicker} – Error Report (${selectedQuarters[0] || "UNKNOWN"})\n\n**Sentiment**\nNeutral\n\n**Positive Highlights**\n- —\n- —\n- —\n- —\n- —\n\n**Negative Highlights**\n- ${detail}\n- —\n- —\n- —\n\n**Summary**\n### Company Financial Report\n\n#### Financial Performance\n| Metric | Latest Quarter (₹ Crores) | Previous Quarter (₹ Crores) | Year Ago Quarter (₹ Crores) | Comments |\n|---|---|---|---|---|\n| Consolidated Revenue | — | — | — | ${detail} |\n| Raw Material Cost | — | — | — | — |\n| Change in Inventories | — | — | — | — |\n| Employee Benefits Expenses | — | — | — | — |\n| Other Expenses | — | — | — | — |\n| Adjusted EBITDA | — | — | — | — |\n| Adjusted EBITDA per ton (₹) | — | — | — | — |\n| Finance Cost | — | — | — | — |\n| Reported PAT | — | — | — | — |\n| Capital Expenditure (₹ Crores) | — | — | — | — |\n\n#### Operational Highlights\n- —\n\n#### Risks and Challenges\n- ${detail}\n\n#### Outlook\n- Upload the required quarterly PDF and retry.\n\n#### Conclusion\nThe requested report data is not available in the database right now. Upload the matching PDF and retry the analysis.\n\n#### References\n1. ${selectedTicker} – Missing report (${selectedQuarters[0] || "UNKNOWN"}). —\n\n*This summary was retrieved directly from our database and represents a pre-generated overview of the report.*`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setSessionId(createSessionId());
    setMessages([]);
  };

  const handleQuickPrompt = (prompt) => {
    setInputValue(prompt);
  };

  const handleFilesSelected = (files) => {
    setUploadFiles((previous) => {
      const next = [...previous];
      files.forEach((file) => {
        if (!next.some((item) => item.name === file.name)) {
          next.push(file);
        }
      });
      return next;
    });
  };

  const handleRemoveFile = (filename) => {
    setUploadFiles((previous) => previous.filter((file) => file.name !== filename));
    setProgressMap((previous) => {
      const next = { ...previous };
      delete next[filename];
      return next;
    });
  };

  const handleStartUpload = async () => {
    if (uploadFiles.length === 0) return;

    const formData = new FormData();
    uploadFiles.forEach((file) => formData.append("files[]", file));
    setUploading(true);
    setUploadCompleted(false);
    setProgressMap(
      Object.fromEntries(
        uploadFiles.map((file) => [file.name, { progress: 15, label: "Uploading...", done: false }])
      )
    );

    try {
      await api.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const poll = async () => {
        const { data } = await api.get("/api/reports");
        const reports = data.reports || [];

        setProgressMap((previous) => {
          const next = { ...previous };
          uploadFiles.forEach((file) => {
            const match = reports.find((report) => report.original_filename === file.name);
            if (!match) {
              next[file.name] = { progress: 35, label: "Extracting text...", done: false };
              return;
            }

            const isDone = match.status === "completed";
            next[file.name] = {
              progress: isDone ? 100 : 75,
              label: isDone ? "Completed" : "Embedding chunks...",
              done: isDone,
              ticker: match.company_ticker,
              quarter: match.quarter,
              totalChunks: match.total_chunks,
            };
          });
          return next;
        });

        const allDone = uploadFiles.every((file) => {
          const report = reports.find((item) => item.original_filename === file.name);
          return report?.status === "completed";
        });

        if (allDone) {
          setUploading(false);
          setUploadCompleted(true);
          fetchTickers();
          return;
        }
        setTimeout(poll, 3000);
      };

      setTimeout(poll, 2000);
    } catch {
      setUploading(false);
    }
  };

  const mainContent = useMemo(() => {
    if (messages.length === 0) {
      return (
        <WelcomeScreen 
          username={username} 
          onQuickPrompt={handleQuickPrompt} 
          onOpenUpload={() => setUploadOpen(true)}
        />
      );
    }
    return (
      <ChatArea
        messages={messages}
        loading={loading}
        onNewChat={handleNewChat}
        title={currentTitle}
        onQuickPrompt={handleQuickPrompt}
      />
    );
  }, [messages, loading]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />

        <main className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/65 shadow-sm backdrop-blur-sm">
            {mainContent}
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              onOpenUpload={() => setUploadOpen(true)}
              disabled={loading}
              tickers={tickers}
              selectedTicker={selectedTicker}
              selectedQuarters={selectedQuarters}
              onTickerSelect={handleTickerSelect}
              onQuarterToggle={handleQuarterToggle}
              tickerOpen={tickerOpen}
              quarterOpen={quarterOpen}
              setTickerOpen={setTickerOpen}
              setQuarterOpen={setQuarterOpen}
            />
          </div>
        </main>
      </div>

      <UploadModal
        open={uploadOpen}
        files={uploadFiles}
        progressMap={progressMap}
        onFilesSelected={handleFilesSelected}
        onRemoveFile={handleRemoveFile}
        onClose={() => {
          if (!uploading) {
            setUploadOpen(false);
            setUploadCompleted(false);
            setUploadFiles([]);
            setProgressMap({});
          }
        }}
        onStartUpload={handleStartUpload}
        uploading={uploading}
        completed={uploadCompleted}
      />
    </div>
  );
}
