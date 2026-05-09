import { CloudUpload, FileText, X } from "lucide-react";

export default function UploadModal({
  open,
  files,
  progressMap,
  onFilesSelected,
  onRemoveFile,
  onClose,
  onStartUpload,
  uploading,
  completed,
}) {
  // Production requirement: PDFs are preloaded on the backend at startup.
  // This modal is kept for optional local/admin workflows, but should never show in production.
  if (import.meta.env.PROD) return null;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-[20px] font-bold text-slate-900">Upload financial report</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Add a PDF to local MongoDB and start retrieval for SIHL.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <label className="mb-5 block cursor-pointer rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <CloudUpload size={28} className="mx-auto mb-3 text-blue-600" />
          <div className="text-[14px] font-semibold text-slate-700">Drag and drop PDF files here</div>
          <div className="mt-1 text-[12px] text-slate-400">or click to browse files</div>
          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(event) => onFilesSelected(Array.from(event.target.files || []))}
          />
        </label>

        <div className="space-y-3">
          {files.map((file) => {
            const status = progressMap[file.name];
            return (
              <div key={file.name} className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-blue-600" />
                    <div>
                      <div className="text-[13px] font-semibold text-slate-800">{file.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  {!uploading ? (
                    <button
                      type="button"
                      onClick={() => onRemoveFile(file.name)}
                      className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>

                {status ? (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-slate-600">{status.label}</span>
                      <span className="font-medium text-slate-500">{status.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${status.progress}%` }}
                      />
                    </div>
                    {status.done ? (
                      <div className="mt-2 text-[12px] text-emerald-600">
                        ✓ {file.name} — {status.ticker || "UNKNOWN"}{" "}
                        {status.quarter
                          ? status.quarter.startsWith("Q")
                            ? status.quarter
                            : `${status.quarter} (Annual)`
                          : "UNKNOWN"}{" "}
                        — {status.totalChunks || 0} chunks stored
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {!completed ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onStartUpload}
                disabled={files.length === 0 || uploading}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-[13px] font-semibold text-white disabled:bg-blue-300"
              >
                {uploading ? "Uploading..." : "Start Upload"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              Done! Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
