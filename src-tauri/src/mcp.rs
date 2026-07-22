// MCP (Model Context Protocol) client support: connects to local, stdio-based
// MCP servers (e.g. `npx -y @modelcontextprotocol/server-filesystem ~`) and
// exposes their tools to the chat agent loop alongside the built-in tools.
//
// Scope: stdio transport only (the common case — local servers spawned as a
// child process). Remote HTTP/SSE MCP servers are not supported yet.
use rmcp::model::{CallToolRequestParams, Tool};
use rmcp::service::{RunningService, ServiceExt};
use rmcp::transport::{ConfigureCommandExt, TokioChildProcess};
use rmcp::RoleClient;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::process::Command;
use tokio::sync::Mutex;

// Tool names exposed to the model are namespaced as `mcp__{server_id}__{tool}`
// so they can't collide with the built-in tools or across MCP servers, and
// are recognizable as MCP-sourced (same convention Claude Code itself uses).
const MCP_TOOL_PREFIX: &str = "mcp__";

#[derive(Debug, Clone, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
}

pub(crate) struct McpConnection {
    service: RunningService<RoleClient, ()>,
    tools: Vec<Tool>,
}

#[derive(Default)]
pub struct McpState(pub Mutex<HashMap<String, McpConnection>>);

pub async fn connect(state: &McpState, config: McpServerConfig) -> Result<Vec<McpToolInfo>, String> {
    let McpServerConfig { id, command, args, env } = config;

    let transport = TokioChildProcess::new(Command::new(&command).configure(|cmd| {
        cmd.args(&args);
        for (key, value) in &env {
            cmd.env(key, value);
        }
    }))
    .map_err(|e| format!("Failed to spawn MCP server '{id}' ({command}): {e}"))?;

    let service = ()
        .serve(transport)
        .await
        .map_err(|e| format!("Failed to connect to MCP server '{id}': {e}"))?;

    let tools_result = service
        .list_tools(Default::default())
        .await
        .map_err(|e| format!("Failed to list tools from MCP server '{id}': {e}"))?;

    let infos: Vec<McpToolInfo> = tools_result
        .tools
        .iter()
        .map(|t| McpToolInfo {
            name: t.name.to_string(),
            description: t.description.clone().map(|d| d.to_string()).unwrap_or_default(),
        })
        .collect();

    let mut connections = state.0.lock().await;
    // Replace any existing connection for this id (e.g. reconnect after an
    // edited config) — the old RunningService is dropped, which tears down
    // its child process.
    connections.insert(
        id,
        McpConnection {
            service,
            tools: tools_result.tools,
        },
    );

    Ok(infos)
}

pub async fn disconnect(state: &McpState, id: &str) {
    let mut connections = state.0.lock().await;
    connections.remove(id);
}

/// Builds the OpenAI-style tool schema entries for every currently-connected
/// MCP server's tools, to append to the built-in tools sent with each chat
/// request.
pub async fn tool_schemas(state: &McpState) -> Vec<Value> {
    let connections = state.0.lock().await;
    let mut schemas = Vec::new();
    for (server_id, conn) in connections.iter() {
        for tool in &conn.tools {
            schemas.push(json!({
                "type": "function",
                "function": {
                    "name": format!("{MCP_TOOL_PREFIX}{server_id}__{}", tool.name),
                    "description": tool.description.clone().unwrap_or_default(),
                    "parameters": Value::Object((*tool.input_schema).clone()),
                }
            }));
        }
    }
    schemas
}

pub fn is_mcp_tool(name: &str) -> bool {
    name.starts_with(MCP_TOOL_PREFIX)
}

/// Splits a namespaced tool name back into (server_id, tool_name).
fn parse_tool_name(name: &str) -> Option<(&str, &str)> {
    let rest = name.strip_prefix(MCP_TOOL_PREFIX)?;
    rest.split_once("__")
}

pub async fn call_tool(state: &McpState, namespaced_name: &str, arguments: Value) -> String {
    let Some((server_id, tool_name)) = parse_tool_name(namespaced_name) else {
        return format!("Malformed MCP tool name: {namespaced_name}");
    };

    let connections = state.0.lock().await;
    let Some(conn) = connections.get(server_id) else {
        return format!("MCP server '{server_id}' is not connected.");
    };

    let mut request = CallToolRequestParams::new(tool_name.to_string());
    if let Some(obj) = arguments.as_object() {
        request = request.with_arguments(obj.clone());
    }
    let result = conn.service.call_tool(request).await;

    match result {
        Ok(call_result) => {
            if call_result.content.is_empty() {
                return "(tool returned no content)".to_string();
            }
            call_result
                .content
                .iter()
                .filter_map(|c| c.as_text().map(|t| t.text.clone()))
                .collect::<Vec<_>>()
                .join("\n")
        }
        Err(e) => format!("Error calling MCP tool '{tool_name}' on '{server_id}': {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Exercises the real connect -> list tools -> namespaced dispatch -> call
    // -> disconnect path against the actual @modelcontextprotocol/server-
    // filesystem reference server (spawned via npx). Ignored by default since
    // it needs Node/npx and network access for the first-run npm fetch; run
    // explicitly with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn connects_lists_tools_and_calls_read_file() {
        let state = McpState::default();
        let dir = std::env::temp_dir().join(format!("rofiant-mcp-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("hello.txt");
        std::fs::write(&file_path, "hello from mcp test").unwrap();

        let config = McpServerConfig {
            id: "test-fs".to_string(),
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                dir.display().to_string(),
            ],
            env: HashMap::new(),
        };

        let tools = connect(&state, config).await.expect("connect should succeed");
        assert!(
            tools.iter().any(|t| t.name == "read_file"),
            "expected a read_file tool, got: {tools:?}"
        );

        let schemas = tool_schemas(&state).await;
        assert!(
            schemas.iter().any(|s| s["function"]["name"] == "mcp__test-fs__read_file"),
            "expected a namespaced read_file schema, got: {schemas:?}"
        );

        let result = call_tool(
            &state,
            "mcp__test-fs__read_file",
            json!({ "path": file_path.display().to_string() }),
        )
        .await;
        assert!(
            result.contains("hello from mcp test"),
            "unexpected tool result: {result}"
        );

        disconnect(&state, "test-fs").await;
        assert!(state.0.lock().await.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }
}
