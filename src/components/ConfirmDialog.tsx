import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, shows a "Don't show this again" checkbox. If the user checks it
   * and confirms, future calls with the same key resolve to true without
   * showing the dialog. */
  dontShowAgainKey?: string;
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

const DONT_SHOW_AGAIN_PREFIX = "rofiant_confirm_dismissed_";

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const confirm = useCallback((options: ConfirmOptions) => {
    if (
      options.dontShowAgainKey &&
      localStorage.getItem(DONT_SHOW_AGAIN_PREFIX + options.dontShowAgainKey) === "1"
    ) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      setDontShowAgain(false);
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      if (result && dontShowAgain && state?.dontShowAgainKey) {
        localStorage.setItem(DONT_SHOW_AGAIN_PREFIX + state.dontShowAgainKey, "1");
      }
      state?.resolve(result);
      setState(null);
    },
    [state, dontShowAgain],
  );

  useEffect(() => {
    if (!state) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, close]);

  const dialog = state ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-[fadeIn_150ms_ease-out]"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl p-4 space-y-3 animate-[modalIn_180ms_ease-out]"
      >
        <div className="text-[13px] font-medium text-foreground">{state.title}</div>
        {state.description && (
          <div className="text-[12px] text-foreground-muted leading-relaxed">{state.description}</div>
        )}
        {state.dontShowAgainKey && (
          <label className="flex items-center gap-2 text-[12px] text-foreground-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="sr-only"
            />
            <span
              className={`w-3.5 h-3.5 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors ${
                dontShowAgain
                  ? "bg-accent-primary border-accent-primary"
                  : "border-border"
              }`}
            >
              {dontShowAgain && <Check className="w-2.5 h-2.5 text-background" strokeWidth={3} />}
            </span>
            Don't show this again
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            autoFocus
            onClick={() => close(false)}
            className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
          >
            {state.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={`h-8 px-3 rounded-lg text-[13px] font-medium hover:opacity-90 transition-opacity ${
              state.danger ? "bg-red-600 text-white" : "bg-foreground text-background"
            }`}
          >
            {state.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
