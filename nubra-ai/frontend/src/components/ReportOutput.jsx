function sentimentClass(sentiment) {
  if (/bullish/i.test(sentiment)) return "bg-[#dcfce7] text-[#166534]";
  if (/bearish/i.test(sentiment)) return "bg-[#fee2e2] text-[#991b1b]";
  return "bg-[#f3f4f6] text-[#374151]";
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

  const headers =
    tableLines[0]?.split("|").map((item) => item.trim()).filter(Boolean) || [];
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
    title,
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
        ? summary.slice(refStart + 1).filter((line) => line && !line.startsWith("*"))
        : [],
    disclaimer: summary.find((line) => line.startsWith("*This summary")) || "",
  };
}

export default function ReportOutput({ response }) {
  const blocks = response
    .split("\n---\n")
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        const parsed = parseBlock(block);
        return (
          <div key={`${parsed.title}-${index}`}>
            <div className="mb-3 text-[14px] font-bold text-slate-900">{parsed.title}</div>

            <div className="mb-3">
              <div className="mb-2 text-[13px] font-bold text-slate-900">Sentiment</div>
              <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${sentimentClass(parsed.sentiment)}`}>
                {parsed.sentiment}
              </span>
            </div>

            <div className="mb-4">
              <div className="mb-2 text-[13px] font-bold text-[#16a34a]">Positive Highlights</div>
              <div className="space-y-1 text-[12.5px] leading-6 text-slate-700">
                {parsed.positive.map((item) => (
                  <div key={item}>• {item}</div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-2 text-[13px] font-bold text-[#ef4444]">Negative Highlights</div>
              <div className="space-y-1 text-[12.5px] leading-6 text-slate-700">
                {parsed.negative.map((item) => (
                  <div key={item}>• {item}</div>
                ))}
              </div>
            </div>

            <div className="report-content">
              <div className="mb-2 text-[13px] font-bold text-slate-900">Financial Performance</div>
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

              <div className="mt-4 text-[13px] font-bold text-slate-900">Operational Highlights</div>
              <div className="mt-1 space-y-1 text-[12.5px] leading-6 text-slate-700">
                {parsed.operational.map((item) => (
                  <div key={item}>• {item}</div>
                ))}
              </div>

              <div className="mt-[14px] text-[13px] font-bold text-slate-900">Risks and Challenges</div>
              <div className="mt-1 space-y-1 text-[12.5px] leading-6 text-slate-700">
                {parsed.risks.map((item) => (
                  <div key={item}>• {item}</div>
                ))}
              </div>

              <div className="mt-[14px] text-[13px] font-bold text-slate-900">Outlook</div>
              <div className="mt-1 space-y-1 text-[12.5px] leading-6 text-slate-700">
                {parsed.outlook.map((item) => (
                  <div key={item}>• {item}</div>
                ))}
              </div>

              <div className="mt-[14px] text-[13px] font-bold text-slate-900">Conclusion</div>
              <p className="mt-1 text-[12.5px] leading-7 text-slate-700">{parsed.conclusion}</p>

              <div className="mt-[14px] text-[13px] font-bold text-slate-900">References</div>
              <div className="mt-1 space-y-1 text-[12px]">
                {parsed.references.map((item) => (
                  <div key={item} className="text-blue-600">
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3 text-[11px] italic text-slate-400">
                {parsed.disclaimer}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
