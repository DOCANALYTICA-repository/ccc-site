import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Toast {
  id: number;
  message: string;
  tone: "default" | "error" | "success";
}

const ToastContext = createContext<{ push: (message: string, tone?: Toast["tone"]) => void } | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "default") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:right-6 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "w-full max-w-sm rounded-control px-4 py-3 text-sm font-medium shadow-panel",
              t.tone === "error" && "bg-[#c10801] text-white",
              t.tone === "success" && "bg-ink text-page",
              t.tone === "default" && "bg-surface text-ink border border-hairline",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
