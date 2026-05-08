import { ArrowUpRight, Search, SendHorizontal, Sparkles } from "lucide-react";

const suggestions = [
  "Identify all stocks which have PE > 75",
  "Show stocks with revenue growing at least 40% over 3 years",
  "Find me stocks with PE < 20 and ROE > 15%",
];

const watchlists = [
  {
    title: "Triple Top",
    description: "Potential reversal setups breaking from extended uptrends.",
  },
  {
    title: "Head & Shoulders",
    description: "Classic distribution patterns with neckline pressure building.",
  },
  {
    title: "Cup & Handle",
    description: "Continuation bases with rounded consolidations and breakout bias.",
  },
  {
    title: "Bullish Crossover",
    description: "Momentum watchlist tracking moving-average strength shifts.",
  },
];

export default function WelcomeScreen({ username, onQuickPrompt, onOpenUpload }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-1 flex-col px-6 py-10">
      <div className="mb-2 text-center text-[34px] font-extrabold tracking-tight text-slate-900">
        Hello, {username}
      </div>
      <div className="mb-8 text-center text-[15px] text-slate-600">
        <span className="font-semibold text-slate-900">SIHL</span>
        <span className="mx-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
          Beta
        </span>
        <span>- your AI market companion.</span>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="rounded-full bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white">
              Watchlist
            </button>
            <button className="rounded-full bg-slate-100 px-4 py-2 text-[12px] font-semibold text-slate-500">
              Report analysis
            </button>
          </div>

          <div className="flex items-center gap-3 text-[12px] text-slate-500">
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2">
              <Search size={14} />
              <span>ALL</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Plan</span>
              <span className="flex h-6 w-10 items-center rounded-full bg-slate-200 px-1">
                <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 px-6 py-8 text-center transition hover:bg-blue-50">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">Upload your PDF reports</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Upload quarterly or annual financial reports to get started with the AI analysis.
            </p>
          </div>
          <button
            onClick={onOpenUpload}
            className="mt-2 rounded-xl bg-blue-600 px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Upload PDFs
          </button>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {suggestions.map((item) => (
          <button
            key={item}
            onClick={() => onQuickPrompt(item)}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-[13px] font-medium text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
          >
            <span>{item}</span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>

      <div className="mb-4 mt-10 text-[15px] font-bold text-slate-900">Public AI Watchlists</div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {watchlists.map((card) => (
          <div
            key={card.title}
            className="min-w-[240px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 text-[15px] font-bold text-slate-900">{card.title}</div>
            <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">
              Chart Patterns
            </div>
            <div className="text-[12.5px] leading-6 text-slate-500">{card.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
