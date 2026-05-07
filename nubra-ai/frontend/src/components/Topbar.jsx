import { Search } from "lucide-react";

const indices = [
  { name: "NIFTY 50", value: "24,313.70", change: "+17.25(0.07%)" },
  { name: "BANKNIFTY", value: "55,867.30", change: "+113.75(0.20%)" },
  { name: "FINNIFTY", value: "26,401.10", change: "+8.35(0.03%)" },
  { name: "SENSEX", value: "77,824.84", change: "+133.68(0.17%)" },
];

export default function Topbar() {
  return (
    <header className="flex h-[42px] items-center justify-between border-b border-slate-200 bg-white px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-[250px] items-center gap-2 rounded-xl bg-slate-100 px-3">
          <Search size={14} className="text-slate-400" />
          <input
            placeholder="Search Stocks"
            className="w-full border-none bg-transparent text-[12px] font-medium text-slate-600 outline-none placeholder:text-slate-400"
          />
          <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
            ⌘U
          </span>
        </div>
        <button className="rounded-xl bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white">
          Ask AI
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        {indices.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2">
            <span className="font-medium text-slate-500">{item.name}</span>
            <span className="font-semibold text-slate-800">{item.value}</span>
            <span className="text-rose-500">{item.change}</span>
            {index < indices.length - 1 ? <span className="text-slate-300">|</span> : null}
          </div>
        ))}
      </div>
    </header>
  );
}
