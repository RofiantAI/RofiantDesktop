import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm font-medium text-neutral-200">Something went wrong.</p>
          <p className="max-w-sm text-xs text-neutral-500">
            {this.state.error.message || "The app hit an unexpected error and couldn't continue."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
          >
            <RefreshCw size={13} />
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
