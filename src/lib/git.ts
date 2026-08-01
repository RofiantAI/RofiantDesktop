import { invoke } from "@tauri-apps/api/core";

export interface WorktreeInfo {
  worktreePath: string;
  branch: string;
  repoPath: string;
}

/** Attaches a conversation to a git repo, creating (or reusing) a dedicated
 * worktree + branch for it. Throws with a user-facing message on failure
 * (e.g. the path isn't a git repo). */
export function attachProjectWorktree(repoPath: string, conversationId: string): Promise<WorktreeInfo> {
  return invoke("git_worktree_attach", { repoPath, conversationId });
}

export function removeProjectWorktree(repoPath: string, worktreePath: string): Promise<void> {
  return invoke("git_worktree_remove", { repoPath, worktreePath });
}
