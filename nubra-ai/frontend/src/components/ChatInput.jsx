import { ChevronDown, Paperclip, SendHorizontal } from "lucide-react";

function DropdownButton({ label, value, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 items-center justify-between rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 shadow-sm disabled:opacity-50"
    >
      <span className="truncate">{value || label}</span>
      <ChevronDown size={15} className="ml-3 text-slate-400" />
    </button>
  );
}

function DropdownPanel({ open, items, onSelect, multi, selectedValues }) {
  if (!open) return null;
  return (
    <div className="absolute left-0 top-12 z-20 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
      {items.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-slate-400">No options available</div>
      ) : (
        items.map((item) => {
          const isSelected = multi
            ? selectedValues.includes(item.value)
            : selectedValues[0] === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelect(item.value)}
              className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] ${
                isSelected ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{item.label}</span>
              {isSelected ? <span className="text-[11px] font-semibold">Selected</span> : null}
            </button>
          );
        })
      )}
    </div>
  );
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onOpenUpload,
  disabled,
  tickers,
  selectedTicker,
  selectedQuarters,
  onTickerSelect,
  onQuarterToggle,
  tickerOpen,
  quarterOpen,
  setTickerOpen,
  setQuarterOpen,
}) {
  const tickerItems = tickers.map((item) => ({
    value: item.ticker,
    label: `${item.ticker}${item.company_name ? ` — ${item.company_name}` : ""}`,
  }));
  const quarterItems =
    tickers.find((item) => item.ticker === selectedTicker)?.quarters.map((quarter) => ({
      value: quarter,
      label: quarter,
    })) || [];

  return (
    <div className="border-t border-slate-200 bg-white px-6 py-4">
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="relative">
          <DropdownButton
            label="Select ticker"
            value={selectedTicker}
            onClick={() => {
              setQuarterOpen(false);
              setTickerOpen((open) => !open);
            }}
          />
          <DropdownPanel
            open={tickerOpen}
            items={tickerItems}
            onSelect={onTickerSelect}
            selectedValues={[selectedTicker]}
          />
        </div>

        <div className="relative">
          <DropdownButton
            label="Select quarters"
            value={selectedQuarters.join(",")}
            disabled={!selectedTicker}
            onClick={() => {
              setTickerOpen(false);
              setQuarterOpen((open) => !open);
            }}
          />
          <DropdownPanel
            open={quarterOpen}
            items={quarterItems}
            onSelect={onQuarterToggle}
            multi
            selectedValues={selectedQuarters}
          />
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenUpload}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
        >
          <Paperclip size={18} />
        </button>

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ask about earnings, risks, EBITDA, volumes, capex or compare quarters..."
          className="h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[13px] font-medium text-slate-700 outline-none placeholder:text-slate-400"
        />

        <button
          type="submit"
          disabled={disabled || !value.trim() || !selectedTicker || selectedQuarters.length === 0}
          className="flex h-12 items-center gap-2 rounded-2xl bg-blue-600 px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          <SendHorizontal size={16} />
          Send
        </button>
      </form>
    </div>
  );
}
