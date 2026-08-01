import { useState } from "react";
import { open as openDirDialog } from "@tauri-apps/plugin-dialog";
import { FolderGit2, FolderOpen, GitBranch, Loader2, Terminal, X } from "lucide-react";

function repoName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}

/** Slim, always-visible bar above the message list — the one place a
 * conversation's git worktree is attached, shown, or detached. Kept out of
 * the Composer toolbar (already busy with model/effort/mode) since a
 * project is a workspace-level choice, not a per-message one, and deserves
 * room for a real path input + Browse button instead of a cramped popover. */
export function ProjectBar({
  projectPath,
  branch,
  onAttach,
  onDetach,
  onOpenTerminal,
}: {
  projectPath?: string;
  branch?: string;
  onAttach: (repoPath: string) => Promise<void>;
  onDetach: () => void;
  onOpenTerminal: () => void;
}) {
  const [path, setPath] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function browse() {
    const dir = await openDirDialog({ directory: true, multiple: false, title: "Choose a project folder" });
    if (typeof dir === "string") setPath(dir);
  }

  async function submit() {
    const trimmed = path.trim();
    if (!trimmed || attaching) return;
    setAttaching(true);
    setError(null);
    try {
      await onAttach(trimmed);
      setPath("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(false);
    }
  }

  if (projectPath) {
    return (
      <div className="flex items-center gap-2 px-4 h-9 border-b border-border shrink-0 text-[12px]">
        <FolderGit2 className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
        <span className="text-foreground font-medium truncate max-w-[16rem]">{repoName(projectPath)}</span>
        {branch && (
          <span className="flex items-center gap-1 text-foreground-muted shrink-0">
            <GitBranch className="w-3 h-3" />
            {branch}
          </span>
        )}
        <span className="text-foreground-muted truncate hidden sm:inline">— isolated worktree</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenTerminal}
          title="Open terminal here"
          aria-label="Open terminal here"
          className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDetach}
          title="Detach project"
          aria-label="Detach project"
          className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 h-9 border-b border-border shrink-0 text-[12px]">
      <FolderGit2 className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
      <span className="text-foreground-muted shrink-0 hidden sm:inline">No project attached</span>
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="/path/to/repo"
        className="flex-1 min-w-0 max-w-sm bg-background-tertiary rounded-md px-2 py-1 text-[12px] text-foreground placeholder:text-foreground-muted outline-none"
      />
      <button
        type="button"
        onClick={() => void browse()}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        Browse
      </button>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!path.trim() || attaching}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground text-background disabled:opacity-40 shrink-0 font-medium transition-opacity"
      >
        {attaching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Attach project
      </button>
      {error && <span className="text-accent-orange truncate">{error}</span>}
    </div>
  );
}
