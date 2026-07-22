import { invoke } from "@tauri-apps/api/core";

// Stdio-based MCP servers only (a spawned local process talking JSON-RPC over
// stdin/stdout) — the common case for local tool servers (filesystem, git,
// databases, etc). Remote HTTP/SSE MCP servers aren't supported yet.
export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

export function connectMcpServer(config: McpServerConfig): Promise<McpToolInfo[]> {
  return invoke("mcp_connect", { config });
}

export function disconnectMcpServer(id: string): Promise<void> {
  return invoke("mcp_disconnect", { id });
}
