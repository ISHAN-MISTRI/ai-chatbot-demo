import {
  BarChart2,
  Bell,
  Brain,
  Briefcase,
  Eye,
  FileText,
  LayoutPanelLeft,
  Link,
  SlidersHorizontal,
  Star,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";

const navItems = [
  { label: "Watchlist", icon: Eye },
  { label: "Market Watch", icon: BarChart2 },
  { label: "Option Chain", icon: Link },
  { label: "Strategies", icon: SlidersHorizontal },
  { label: "Chart Analyzer", icon: TrendingUp },
  { label: "Portfolio", icon: Briefcase },
  { label: "Orders", icon: FileText },
  { label: "Nubra AI", icon: Brain, active: true, badge: "Beta" },
  { label: "IPO", icon: Star },
  { label: "Alerts", icon: Bell },
];

export default function Sidebar() {
  return (
    <aside className="relative flex h-screen w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5">
      <div className="mb-7 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Zap size={18} fill="currentColor" />
          </div>
          <div className="text-[22px] font-extrabold tracking-tight text-slate-900">Nubra</div>
        </div>
        <button className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <LayoutPanelLeft size={17} />
        </button>
      </div>

      <nav className="space-y-1">
        {navItems.map(({ label, icon: Icon, active, badge }) => (
          <button
            key={label}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium transition ${
              active
                ? "bg-blue-50 text-blue-600"
                : "text-slate-500 hover:bg-[#f5f5f5] hover:text-slate-700"
            }`}
          >
            <span className="flex items-center gap-3">
              <Icon size={16} />
              {label}
            </span>
            {badge ? (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 transition hover:bg-[#f5f5f5] hover:text-slate-700">
          <User size={16} />
          Profile
        </button>
      </div>

      <div className="absolute -right-10 top-1/2 -translate-y-1/2 rounded-r-xl border border-l-0 border-slate-200 bg-white px-2 py-4 shadow-sm">
        <div className="vertical-history text-[10px] font-semibold uppercase text-slate-400">
          Chat history
        </div>
      </div>
    </aside>
  );
}
