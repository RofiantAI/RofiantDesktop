import type { CSSProperties } from "react";
import { Loader2 } from "lucide-react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`skeleton rounded-md ${className}`} style={style} />;
}

export function ConversationListSkeleton() {
  return (
    <div className="px-2 pt-3 space-y-1" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 h-8 px-2">
          <Skeleton className="w-3.5 h-3.5 shrink-0" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${65 - i * 5}%` }} />
        </div>
      ))}
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <Loader2 className="w-5 h-5 animate-spin text-foreground-muted" />
    </div>
  );
}
