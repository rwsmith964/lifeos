"use client";

// Minimal shared toast system (no external dependency). Mount
// <ToastProvider> once near the root and call useToast() anywhere under it
// to show a transient message, optionally with an action button (used for
// delete-undo across calendar events, gifts, activities, etc. per the P0/P2
// "every destructive action needs undo where possible" requirement).
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface ToastOptions {
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  /** Milliseconds before auto-dismiss. Defaults to 6000; undo toasts should
   * use a longer window since the user needs time to notice and act. */
  durationMs?: number;
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      toastIdCounter += 1;
      const id = `toast-${toastIdCounter}`;
      setToasts((prev) => [...prev, { ...options, id }]);
      const duration = options.durationMs ?? 6000;
      const timeout = setTimeout(() => dismissToast(id), duration);
      timeoutsRef.current.set(id, timeout);
      return id;
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div
        className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2",
              toast.variant === "destructive"
                ? "border-destructive/30 bg-destructive text-destructive-foreground"
                : toast.variant === "success"
                  ? "border-emerald-600/30 bg-emerald-600 text-white"
                  : "border-border bg-foreground text-background"
            )}
          >
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs opacity-90">{toast.description}</p>}
            </div>
            {toast.action && (
              <button
                type="button"
                className="shrink-0 text-sm font-semibold underline underline-offset-2"
                onClick={async () => {
                  dismissToast(toast.id);
                  await toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 opacity-70 hover:opacity-100"
              onClick={() => dismissToast(toast.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
