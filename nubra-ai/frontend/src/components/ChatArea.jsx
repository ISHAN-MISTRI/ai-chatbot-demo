import { Plus, UserRound } from "lucide-react";
import ReportOutput from "./ReportOutput";

const quickChips = [
  "Summarize Q3 earnings",
  "Compare EBITDA across quarters",
  "Highlight key risks and outlook",
];

function LoadingDots() {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500"
          style={{ animationDelay: `${dot * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function ChatArea({ messages, loading, onNewChat, title, onQuickPrompt }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <button
          onClick={onNewChat}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600"
        >
          <Plus size={16} />
          New chat
        </button>
        <div className="text-[16px] font-bold text-slate-900">{title}</div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-[12px] font-bold text-white">
          GD
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          {messages.length === 0 ? (
            <div className="mb-6 flex flex-wrap gap-2">
              {quickChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => onQuickPrompt(chip)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 shadow-sm"
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-6">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={`user-${index}`} className="flex justify-end">
                  <div className="max-w-3xl text-right text-[14px] font-medium leading-7 text-slate-800">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div
                  key={`assistant-${index}`}
                  className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <ReportOutput response={message.content} />
                </div>
              )
            )}
            {loading ? <LoadingDots /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
