import { X, Check, Circle } from "lucide-react";
import type { OnboardingState } from "../lib/onboarding";

const TASKS: { key: keyof Omit<OnboardingState, "dismissed">; label: string }[] = [
  { key: "sentMessage", label: "Send your first message" },
  { key: "pickedModel", label: "Pick a model" },
  { key: "openedSettings", label: "Open settings" },
];

export function GetStartedCard({
  state,
  onDismiss,
}: {
  state: OnboardingState;
  onDismiss: () => void;
}) {
  const done = TASKS.filter((t) => state[t.key]).length;
  const allDone = done === TASKS.length;

  return (
    <div
      className="fixed bottom-4 left-4 z-50 w-72 rounded-lg border border-border-light bg-background-secondary shadow-lg"
      style={{ animation: "toastIn 200ms ease-out" }}
    >
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
        <div className="text-sm font-medium text-foreground">
          {allDone ? "You're all set!" : `Get started (${done}/${TASKS.length})`}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex items-center justify-center w-5 h-5 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ul className="px-3.5 pt-2 pb-3 space-y-1.5">
        {TASKS.map((t) => (
          <li key={t.key} className="flex items-center gap-2 text-xs">
            {state[t.key] ? (
              <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
            )}
            <span className={state[t.key] ? "text-foreground-muted line-through" : "text-foreground"}>
              {t.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
