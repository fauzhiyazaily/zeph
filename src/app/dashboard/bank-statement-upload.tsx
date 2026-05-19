"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, ImageUp, LoaderCircle, ShieldCheck, UploadCloud } from "lucide-react";

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "success"; message: string }
  | { status: "error"; message: string; retryable: boolean };

const acceptedFormats = ".csv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp";

function formatLabel(name: string) {
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".csv")) return "CSV";
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return "Excel";
  return "Image";
}

export function BankStatementUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>({ status: "idle" });

  const uploadFile = (file: File) => {
    setSelectedFileName(file.name);
    setState({ status: "uploading", progress: 4 });

    const formData = new FormData();
    formData.append("statement", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/ingestion/bank-statement");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const progress = Math.max(8, Math.min(96, Math.round((event.loaded / event.total) * 100)));
      setState({ status: "uploading", progress });
    };

    xhr.onerror = () => {
      setState({
        status: "error",
        message: "Upload failed before the statement could be processed. Retry in a moment.",
        retryable: true,
      });
    };

    xhr.onload = () => {
      const raw = xhr.responseText || "{}";
      const payload = JSON.parse(raw) as {
        status?: "accepted" | "rejected";
        deduplicated?: boolean;
        error?: { message?: string; retryable?: boolean };
      };

      if (xhr.status >= 200 && xhr.status < 300 && payload.status === "accepted") {
        setState({
          status: "success",
          message: payload.deduplicated
            ? "This statement was already processed. Existing insights were restored."
            : "Statement uploaded, parsed, and connected to Zeph insights.",
        });
        router.refresh();
        return;
      }

      setState({
        status: "error",
        message: payload.error?.message ?? "The statement could not be processed.",
        retryable: payload.error?.retryable ?? false,
      });
    };

    xhr.send(formData);
  };

  const onFileChange = (file: File | null) => {
    if (!file) {
      return;
    }
    uploadFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files.item(0);
    onFileChange(file);
  };

  return (
    <section className="glass-card rounded-2xl p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Bank statement upload</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Upload PDF, Excel, CSV, or supported image statements to backfill transactions, detect income and recurring payments, and unlock richer financial analysis.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-950/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-100">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
          Secure processing
        </div>
      </div>

      <label
        className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[1.6rem] border border-dashed px-6 py-8 text-center transition ${
          isDragOver
            ? "border-cyan-300/70 bg-cyan-500/12"
            : "border-indigo-300/30 bg-slate-950/30 hover:border-cyan-300/55 hover:bg-slate-950/45"
        }`}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          accept={acceptedFormats}
          className="sr-only"
          onChange={(event) => onFileChange(event.target.files?.item(0) ?? null)}
          type="file"
        />

        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-indigo-500/30 text-cyan-100 shadow-inner shadow-cyan-950/40">
          {state.status === "uploading" ? (
            <LoaderCircle aria-hidden="true" className="h-7 w-7 animate-spin" />
          ) : (
            <UploadCloud aria-hidden="true" className="h-7 w-7" />
          )}
        </div>

        <p className="mt-4 text-base font-semibold text-slate-100">Drop your statement here or choose a file</p>
        <p className="mt-2 text-sm text-slate-300">
          Supports PDF, Excel, CSV, and image formats with OCR where available.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300/30 bg-slate-950/25 px-3 py-1">
            <FileText aria-hidden="true" className="h-3.5 w-3.5" /> PDF
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300/30 bg-slate-950/25 px-3 py-1">
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" /> Excel / CSV
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300/30 bg-slate-950/25 px-3 py-1">
            <ImageUp aria-hidden="true" className="h-3.5 w-3.5" /> Image OCR
          </span>
        </div>
      </label>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-300/30 bg-slate-950/25 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Processing flow</p>
          <ol className="mt-3 space-y-2 text-sm text-slate-200">
            <li>1. Upload and validate the document securely.</li>
            <li>2. Parse and normalize statement rows into structured financial events.</li>
            <li>3. Run AI-backed analysis plus debit import into Zeph transactions.</li>
            <li>4. Surface reusable insights, recurring payments, and health signals.</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-300/30 bg-slate-950/25 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current upload</p>
          <p className="mt-3 text-sm text-slate-200">
            {selectedFileName ? `${selectedFileName} (${formatLabel(selectedFileName.toLowerCase())})` : "No file selected yet."}
          </p>

          {state.status === "uploading" ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Uploading and processing</span>
                <span>{state.progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 transition-[width] duration-200"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {state.status === "success" ? (
            <p className="mt-4 rounded-xl border border-emerald-300/40 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100">
              {state.message}
            </p>
          ) : null}

          {state.status === "error" ? (
            <div className="mt-4 rounded-xl border border-rose-300/40 bg-rose-950/25 px-3 py-2 text-sm text-rose-100">
              <p>{state.message}</p>
              {state.retryable ? (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-100 underline"
                  onClick={() => inputRef.current?.click()}
                >
                  Retry upload
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
