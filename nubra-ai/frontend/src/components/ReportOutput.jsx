import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  CheckCircle2, 
  AlertTriangle, 
  BarChart3, 
  Activity, 
  Target, 
  ShieldAlert 
} from "lucide-react";

function sentimentInfo(sentiment) {
  if (/bullish/i.test(sentiment)) {
    return { bg: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: <TrendingUp size={14} className="mr-1.5" /> };
  }
  if (/bearish/i.test(sentiment)) {
    return { bg: "bg-rose-50 border-rose-200 text-rose-700", icon: <TrendingDown size={14} className="mr-1.5" /> };
  }
  return { bg: "bg-slate-50 border-slate-200 text-slate-600", icon: <Minus size={14} className="mr-1.5" /> };
}

function parseBlock(block) {
  const lines = block.split("\n").map((line) => line.trimEnd());
  const title = lines[0] || "";

  const between = (start, end) => {
    const startIndex = lines.findIndex((line) => line === start);
    if (startIndex === -1) return [];
    const values = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (end.includes(line)) break;
      values.push(line);
    }
    return values;
  };

  const sentiment = (between("**Sentiment**", ["**Positive Highlights**"])[0] || "Neutral").trim();
  const positive = between("**Positive Highlights**", ["**Negative Highlights**"])
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  const negative = between("**Negative Highlights**", ["**Summary**"])
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  const summary = between("**Summary**", []);

  const tableStart = summary.findIndex((line) => line === "#### Financial Performance");
  const opStart = summary.findIndex((line) => line === "#### Operational Highlights");
  const riskStart = summary.findIndex((line) => line === "#### Risks and Challenges");
  const outlookStart = summary.findIndex((line) => line === "#### Outlook");
  const conclusionStart = summary.findIndex((line) => line === "#### Conclusion");
  const refStart = summary.findIndex((line) => line === "#### References");

  const tableLines =
    tableStart !== -1 && opStart !== -1
      ? summary.slice(tableStart + 1, opStart).filter((line) => line.startsWith("|"))
      : [];

  const headers = tableLines[0]?.split("|").map((item) => item.trim()).filter(Boolean) || [];
  const rows = tableLines
    .slice(2)
    .map((line) => line.split("|").map((item) => item.trim()).filter(Boolean))
    .filter((row) => row.length);

  const bulletRange = (startIndex, endIndex) =>
    startIndex !== -1 && endIndex !== -1
      ? summary
          .slice(startIndex + 1, endIndex)
          .filter((line) => line.startsWith("- "))
          .map((line) => line.slice(2))
      : [];

  return {
    title: title.replace("➤ ", ""),
    sentiment,
    positive,
    negative,
    headers,
    rows,
    operational: bulletRange(opStart, riskStart),
    risks: bulletRange(riskStart, outlookStart),
    outlook: bulletRange(outlookStart, conclusionStart),
    conclusion:
      conclusionStart !== -1 && refStart !== -1
        ? summary.slice(conclusionStart + 1, refStart).filter(Boolean).join(" ")
        : "",
    references:
      refStart !== -1
        ? summary.slice(refStart + 1).filter((line) => line && !line.startsWith("*Disclaimer:"))
        : [],
    disclaimer: summary.find((line) => line.startsWith("*Disclaimer:")) || "",
  };
}

export default function ReportOutput({ response }) {
  const isStrictFormat = response.includes("**Sentiment**") && response.includes("#### Financial Performance");

  if (!isStrictFormat) {
    return (
      <div className="text-[13.5px] leading-relaxed text-slate-700 space-y-3 [&_p]:mb-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-[14px] [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:border-collapse [&_table]:mt-3 [&_table]:mb-3 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
      </div>
    );
  }

  const blocks = response
    .split("\n---\n")
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-8">
      {blocks.map((block, index) => {
        const parsed = parseBlock(block);
        const sInfo = sentimentInfo(parsed.sentiment);

        return (
          <div key={`${parsed.title}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
            {/* Premium Header */}
            <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-[17px] font-bold text-slate-900 tracking-tight">{parsed.title}</h2>
                <div className={`flex w-fit items-center rounded-full border px-3.5 py-1.5 font-bold text-[12px] shadow-sm tracking-wide uppercase ${sInfo.bg}`}>
                  {sInfo.icon}
                  {parsed.sentiment}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {/* Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5">
                  <div className="flex items-center gap-2 mb-4 text-emerald-700">
                    <CheckCircle2 size={18} />
                    <h3 className="font-bold text-[14px]">Positive Highlights</h3>
                  </div>
                  <ul className="space-y-2.5 text-[13px] text-slate-700">
                    {parsed.positive.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-emerald-500 mt-0.5">•</span>
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-5">
                  <div className="flex items-center gap-2 mb-4 text-rose-700">
                    <AlertTriangle size={18} />
                    <h3 className="font-bold text-[14px]">Negative Highlights</h3>
                  </div>
                  <ul className="space-y-2.5 text-[13px] text-slate-700">
                    {parsed.negative.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-rose-500 mt-0.5">•</span>
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Financial Performance Table */}
              <div className="report-content">
                <div className="flex items-center gap-2 mb-4 text-indigo-900">
                  <BarChart3 size={18} className="text-indigo-600" />
                  <h3 className="font-bold text-[15px]">Financial Performance</h3>
                </div>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        {parsed.headers.map((header) => (
                          <th key={header}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.map((row, rowIndex) => (
                        <tr key={`${rowIndex}-${row[0] || "row"}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3-Column Insights */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-6 border-t border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-4 text-slate-900">
                    <Activity size={16} className="text-blue-500" />
                    <h3 className="font-bold text-[14px]">Operational</h3>
                  </div>
                  <ul className="space-y-3 text-[13px] text-slate-600">
                    {parsed.operational.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-4 text-slate-900">
                    <ShieldAlert size={16} className="text-amber-500" />
                    <h3 className="font-bold text-[14px]">Risks & Challenges</h3>
                  </div>
                  <ul className="space-y-3 text-[13px] text-slate-600">
                    {parsed.risks.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-amber-400 mt-0.5">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-4 text-slate-900">
                    <Target size={16} className="text-purple-500" />
                    <h3 className="font-bold text-[14px]">Outlook</h3>
                  </div>
                  <ul className="space-y-3 text-[13px] text-slate-600">
                    {parsed.outlook.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-purple-400 mt-0.5">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Conclusion */}
              <div className="rounded-xl bg-slate-50 p-5 mt-2 border border-slate-100 shadow-sm">
                <h3 className="font-bold text-[14px] text-slate-900 mb-2">Conclusion</h3>
                <p className="text-[13.5px] leading-relaxed text-slate-600">{parsed.conclusion}</p>
              </div>

              {/* References & Disclaimer */}
              <div className="pt-6 border-t border-slate-100">
                <h3 className="font-bold text-[11px] text-slate-400 uppercase tracking-widest mb-3">References</h3>
                <div className="space-y-1.5 text-[11.5px]">
                  {parsed.references.map((item) => (
                    <div key={item} className="text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer font-medium">
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-[11px] font-medium text-slate-400/80 italic leading-relaxed">
                  {parsed.disclaimer}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
