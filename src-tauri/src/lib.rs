use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Cursor;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::watch;

const CANCELLED: &str = "__cancelled__";

#[derive(Default)]
struct ChatCancellations(Mutex<HashMap<String, watch::Sender<bool>>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    role: String,
    content: String,
    #[serde(default)]
    image_data_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    base_url: String,
    api_key: String,
}

#[derive(Debug, Clone, Serialize)]
struct ChatChunkPayload {
    request_id: String,
    delta: String,
}

#[derive(Debug, Clone, Serialize)]
struct ChatDonePayload {
    request_id: String,
}

#[derive(Debug, Clone, Serialize)]
struct ChatUsagePayload {
    request_id: String,
    model: String,
    input_tokens: u64,
    output_tokens: u64,
}

#[derive(Debug, Clone, Serialize)]
struct ChatErrorPayload {
    request_id: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaPullProgress {
    model: String,
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct FileChangePayload {
    conversation_id: String,
    path: String,
    old_content: Option<String>,
    new_content: String,
}

const GROQ_PROXY_URL: &str = "https://nxwzaztltnqdslnvehva.supabase.co/functions/v1/groq-proxy";
const GROQ_TRANSCRIBE_PROXY_URL: &str =
    "https://nxwzaztltnqdslnvehva.supabase.co/functions/v1/groq-transcribe-proxy";
const TRANSCRIBE_MODEL: &str = "whisper-large-v3-turbo";
const MAX_AGENT_STEPS: u32 = 6;
const TITLE_MODEL: &str = "openai/gpt-oss-20b";
const TITLE_SYSTEM_PROMPT: &str = "Generate a short, specific title (3-6 words, no quotes, no \
trailing punctuation) that summarizes what the user wants. Reply with only the title, nothing else.";

fn home_dir() -> String {
    if let Ok(home) = std::env::var("HOME") {
        return home;
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        return profile;
    }
    if cfg!(target_os = "windows") {
        "C:\\".to_string()
    } else {
        "/".to_string()
    }
}

fn resolve_path(path: &str) -> PathBuf {
    let home = home_dir();
    let expanded = if let Some(rest) = path.strip_prefix("~/") {
        format!("{home}/{rest}")
    } else if path == "~" {
        home.clone()
    } else {
        path.to_string()
    };
    let p = PathBuf::from(&expanded);
    if p.is_absolute() {
        p
    } else {
        PathBuf::from(&home).join(&expanded)
    }
}

fn tool_list_directory(path: &str) -> String {
    let dir = resolve_path(path);
    match std::fs::read_dir(&dir) {
        Ok(entries) => {
            let mut items: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    if is_dir {
                        format!("{name}/")
                    } else {
                        name
                    }
                })
                .collect();
            items.sort();
            if items.is_empty() {
                "(empty directory)".to_string()
            } else {
                items.join("\n")
            }
        }
        Err(e) => format!("Error reading directory {}: {}", dir.display(), e),
    }
}

fn tool_read_file(path: &str) -> String {
    const MAX_LEN: usize = 8000;
    let file = resolve_path(path);
    match std::fs::read_to_string(&file) {
        Ok(content) if content.len() > MAX_LEN => {
            format!(
                "{}\n... (truncated, {} bytes total)",
                &content[..MAX_LEN],
                content.len()
            )
        }
        Ok(content) => content,
        Err(e) => format!("Error reading file {}: {}", file.display(), e),
    }
}

fn tool_write_file(path: &str, content: &str) -> Result<String, String> {
    let file = resolve_path(path);
    if let Some(parent) = file.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return Err(format!("Error creating parent directories for {}: {}", file.display(), e));
        }
    }
    match std::fs::write(&file, content) {
        Ok(()) => Ok(format!("Wrote {} bytes to {}", content.len(), file.display())),
        Err(e) => Err(format!("Error writing file {}: {}", file.display(), e)),
    }
}

/// Blocks commands that are almost never intentional and can destroy the
/// whole system or user data outright (disk wipes, fork bombs, recursive
/// deletes of root/home, privilege escalation). This is a defense-in-depth
/// backstop, not a full sandbox — the model is still trusted for everything
/// else, so it only catches the small set of commands with no legitimate
/// recovery path.
fn is_blocked_command(command: &str) -> Option<&'static str> {
    let lower = command.to_lowercase();
    let normalized: String = lower.split_whitespace().collect::<Vec<_>>().join(" ");

    let patterns: &[(&str, &str)] = &[
        ("rm -rf /", "recursive delete of the root filesystem"),
        ("rm -rf ~", "recursive delete of the home directory"),
        ("rm -rf *", "recursive delete with an unbounded wildcard"),
        ("rm -fr /", "recursive delete of the root filesystem"),
        (":(){:|:&};:", "fork bomb"),
        ("mkfs", "formatting a disk/partition"),
        ("dd if=", "raw disk write via dd"),
        ("> /dev/sd", "overwriting a raw disk device"),
        ("> /dev/nvme", "overwriting a raw disk device"),
        ("chmod -r 777 /", "world-writable permissions on the root filesystem"),
        ("chmod -r 000 /", "removing all permissions on the root filesystem"),
        ("shutdown", "shutting down the machine"),
        ("reboot", "rebooting the machine"),
        ("sudo rm", "privilege-escalated delete"),
        ("sudo dd", "privilege-escalated raw disk write"),
    ];

    for (pattern, reason) in patterns {
        if normalized.contains(pattern) {
            return Some(reason);
        }
    }
    None
}

/// Builds a Command that runs `command` through the platform's shell:
/// `cmd /C` on Windows, `sh -c` everywhere else.
fn shell_command(command: &str) -> std::process::Command {
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("cmd");
        c.arg("/C");
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.arg("-c");
        c
    };
    cmd.arg(command);
    cmd
}

fn tool_run_command(command: &str, cwd: Option<&str>) -> String {
    const MAX_LEN: usize = 6000;

    if let Some(reason) = is_blocked_command(command) {
        return format!(
            "Blocked: this command was not run because it matches a known-destructive pattern ({reason}). \
If this is genuinely what the user wants, ask them to run it themselves outside the app."
        );
    }

    let workdir = cwd.map(resolve_path).unwrap_or_else(|| PathBuf::from(home_dir()));
    let output = shell_command(command).current_dir(&workdir).output();

    match output {
        Ok(out) => {
            let stdout: String = String::from_utf8_lossy(&out.stdout).chars().take(MAX_LEN).collect();
            let stderr: String = String::from_utf8_lossy(&out.stderr).chars().take(MAX_LEN).collect();
            let mut result = String::new();
            if !stdout.trim().is_empty() {
                result.push_str("stdout:\n");
                result.push_str(&stdout);
                result.push('\n');
            }
            if !stderr.trim().is_empty() {
                result.push_str("stderr:\n");
                result.push_str(&stderr);
                result.push('\n');
            }
            result.push_str(&format!("exit code: {}", out.status.code().unwrap_or(-1)));
            result
        }
        Err(e) => format!("Error running command: {e}"),
    }
}

fn tool_get_clipboard() -> String {
    match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
        Ok(text) => text,
        Err(e) => format!("Error reading clipboard: {e}"),
    }
}

fn tool_set_clipboard(text: &str) -> String {
    match arboard::Clipboard::new().and_then(|mut c| c.set_text(text.to_string())) {
        Ok(()) => "Clipboard set.".to_string(),
        Err(e) => format!("Error setting clipboard: {e}"),
    }
}

/// Returns a data: URL of a PNG screenshot on success, or an error string on failure.
fn tool_take_screenshot() -> Result<String, String> {
    use base64::Engine;
    let monitors = xcap::Monitor::all().map_err(|e| format!("Error listing monitors: {e}"))?;
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary())
        .or_else(|| monitors.first())
        .ok_or_else(|| "No monitors found".to_string())?;
    let img = monitor
        .capture_image()
        .map_err(|e| format!("Error capturing screen: {e}"))?;

    let mut buf: Vec<u8> = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| format!("Error encoding screenshot: {e}"))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/png;base64,{b64}"))
}

fn tool_list_processes() -> String {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let mut lines: Vec<String> = sys
        .processes()
        .values()
        .map(|p| {
            format!(
                "{}\t{}\t{:.1}%\t{}MB",
                p.pid(),
                p.name().to_string_lossy(),
                p.cpu_usage(),
                p.memory() / 1024 / 1024
            )
        })
        .collect();
    lines.sort();
    format!("PID\tNAME\tCPU\tMEM\n{}", lines.join("\n"))
}

fn tool_kill_process(pid: u32) -> String {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    match sys.process(sysinfo::Pid::from_u32(pid)) {
        Some(p) => {
            if p.kill() {
                format!("Killed process {pid}.")
            } else {
                format!("Failed to kill process {pid} (permission denied or already exited).")
            }
        }
        None => format!("No process with pid {pid} found."),
    }
}

/// Launches an app/command detached, without waiting for it to exit — unlike
/// run_command, which blocks on the child and would hang for GUI apps.
fn tool_open_app(command: &str) -> String {
    if let Some(reason) = is_blocked_command(command) {
        return format!("Blocked: this command was not run because it matches a known-destructive pattern ({reason}).");
    }
    match shell_command(command)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => format!("Launched `{command}` (pid {}).", child.id()),
        Err(e) => format!("Error launching `{command}`: {e}"),
    }
}

fn tools_schema() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "List the files and folders inside a directory on the user's computer.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path, or a path relative to the home directory (e.g. 'Desktop', '~/Documents')."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the text contents of a file on the user's computer.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path, or a path relative to the home directory."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Create or overwrite a text file on the user's computer with the given content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path, or a path relative to the home directory."
                        },
                        "content": {
                            "type": "string",
                            "description": "The full text content to write to the file."
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_command",
                "description": "Run a shell command on the user's computer and return its stdout, stderr, and exit code. Use this to open apps, install packages, manage processes, query system state, or automate any task the file tools can't cover.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": if cfg!(target_os = "windows") {
                                "The shell command to execute (runs via cmd /C), e.g. 'dir' or 'start https://example.com'."
                            } else {
                                "The shell command to execute, e.g. 'ls -la' or 'xdg-open https://example.com'."
                            }
                        },
                        "cwd": {
                            "type": "string",
                            "description": "Working directory to run the command in. Defaults to the home directory."
                        }
                    },
                    "required": ["command"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_clipboard",
                "description": "Read the current text contents of the system clipboard.",
                "parameters": { "type": "object", "properties": {} }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "set_clipboard",
                "description": "Set the system clipboard to the given text.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "Text to place on the clipboard." }
                    },
                    "required": ["text"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "take_screenshot",
                "description": "Capture a screenshot of the primary display so you can see what's currently on screen.",
                "parameters": { "type": "object", "properties": {} }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_processes",
                "description": "List currently running processes with pid, name, CPU%, and memory usage.",
                "parameters": { "type": "object", "properties": {} }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "kill_process",
                "description": "Kill a running process by its pid.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pid": { "type": "integer", "description": "Process ID to kill." }
                    },
                    "required": ["pid"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "open_app",
                "description": if cfg!(target_os = "windows") {
                    "Launch an application, file, or URL without blocking (use this instead of run_command for opening GUI apps, since run_command waits for the process to exit). Examples: 'notepad', 'code .', 'start https://example.com'."
                } else {
                    "Launch an application, file, or URL without blocking (use this instead of run_command for opening GUI apps, since run_command waits for the process to exit). Examples: 'firefox', 'code .', 'xdg-open https://example.com'."
                },
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Shell command to launch the app." }
                    },
                    "required": ["command"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "send_notification",
                "description": "Show a desktop notification to the user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "body": { "type": "string" }
                    },
                    "required": ["title", "body"]
                }
            }
        }
    ])
}

fn system_prompt() -> String {
    let home = home_dir();
    format!(
        "You are Rofiant, an AI assistant with real, direct access to the user's computer through \
tools: list_directory, read_file, write_file, run_command, get_clipboard, set_clipboard, \
take_screenshot, list_processes, kill_process, open_app, and send_notification. These are not \
simulations — they execute for real on the user's machine. The user's home directory is exactly \
`{home}`. Use paths relative to it (e.g. 'Desktop/notes.txt') or prefixed with '~/' — never guess \
a literal username like /home/user/... or /Users/username/..., since it will resolve to the wrong \
place or fail with a permission error. Prefer open_app over run_command for launching GUI \
applications, since run_command waits for the process to exit and will hang. Use take_screenshot \
when you need to see what's currently on screen. Use tools proactively whenever they would help \
answer a request. Never claim you lack access to the file system, the terminal, the clipboard, \
running processes, or the screen — you have it. Act like a normal, capable assistant: just do the \
task. Only pause to ask before something destructive or irreversible (deleting data, killing an \
important process, overwriting something important, anything that can't be undone). Format replies \
in plain Markdown: real spaces, never HTML entities like &nbsp;; fenced ``` code blocks for file \
listings, command output, or code, not single backticks. Skip decorative emoji unless the user uses \
them first. Call tools only through the real tool-calling mechanism — never type out tool-call \
syntax as plain text (e.g. don't write things like <function=name>{{...}}</function> in your reply). \
If you want to lay out a multi-step plan before acting, describe it in plain language without any \
call syntax, tags, or code."
    )
}

#[tauri::command]
async fn send_chat(
    app: AppHandle,
    cancellations: State<'_, ChatCancellations>,
    request_id: String,
    conversation_id: String,
    messages: Vec<ChatMessage>,
    model: String,
    access_token: String,
    provider: Option<ProviderConfig>,
) -> Result<(), String> {
    let (cancel_tx, cancel_rx) = watch::channel(false);
    cancellations.0.lock().unwrap().insert(request_id.clone(), cancel_tx);

    let result = run_agent(
        &app,
        &request_id,
        &conversation_id,
        &model,
        messages,
        &access_token,
        provider,
        cancel_rx,
    )
    .await;

    cancellations.0.lock().unwrap().remove(&request_id);

    if let Err(err) = &result {
        if err == CANCELLED {
            let _ = app.emit("chat-done", ChatDonePayload { request_id });
            return Ok(());
        }
        let _ = app.emit(
            "chat-error",
            ChatErrorPayload {
                request_id: request_id.clone(),
                message: err.clone(),
            },
        );
        return Err(err.clone());
    }

    let _ = app.emit("chat-done", ChatDonePayload { request_id });
    Ok(())
}

#[tauri::command]
fn stop_chat(cancellations: State<'_, ChatCancellations>, request_id: String) -> Result<(), String> {
    if let Some(tx) = cancellations.0.lock().unwrap().get(&request_id) {
        let _ = tx.send(true);
    }
    Ok(())
}

/// Some weaker models (especially small local ones served through Ollama)
/// don't reliably emit structured tool_calls and instead leak their
/// internal pseudo tool-call notation (e.g. `<function=name>{...}</function>`)
/// as plain reply text. Strip it defensively so it never reaches the UI.
fn strip_leaked_tool_syntax(text: &str) -> String {
    const OPEN: &str = "<function=";
    const CLOSE: &str = "</function>";

    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    loop {
        match rest.find(OPEN) {
            Some(start) => {
                result.push_str(&rest[..start]);
                let after_open = &rest[start..];
                match after_open.find(CLOSE) {
                    Some(end_rel) => rest = &after_open[end_rel + CLOSE.len()..],
                    None => {
                        // Unterminated tag: drop the remainder defensively.
                        rest = "";
                    }
                }
            }
            None => {
                result.push_str(rest);
                break;
            }
        }
    }
    result
}

fn emit_text(app: &AppHandle, request_id: &str, text: impl Into<String>) {
    let _ = app.emit(
        "chat-chunk",
        ChatChunkPayload {
            request_id: request_id.to_string(),
            delta: text.into(),
        },
    );
}

async fn run_agent(
    app: &AppHandle,
    request_id: &str,
    conversation_id: &str,
    model: &str,
    messages: Vec<ChatMessage>,
    access_token: &str,
    provider: Option<ProviderConfig>,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let (url, auth_token): (String, &str) = match &provider {
        Some(p) => (
            format!("{}/chat/completions", p.base_url.trim_end_matches('/')),
            p.api_key.as_str(),
        ),
        None => (GROQ_PROXY_URL.to_string(), access_token),
    };
    // Some chat templates (notably several local models served through
    // Ollama) only honor a single system message and silently drop or
    // mangle any additional ones. Fold any extra system-role messages the
    // frontend sends (custom instructions, active agent prompt, rules,
    // plan-mode instruction) into the one system message instead of
    // sending them as separate entries.
    let mut system_content = system_prompt();
    let mut rest: Vec<ChatMessage> = Vec::with_capacity(messages.len());
    for m in messages {
        if m.role == "system" && m.image_data_url.is_none() {
            system_content.push_str("\n\n");
            system_content.push_str(&m.content);
        } else {
            rest.push(m);
        }
    }

    let mut convo: Vec<Value> = vec![json!({ "role": "system", "content": system_content })];
    convo.extend(rest.into_iter().map(|m| match m.image_data_url {
        Some(url) => json!({
            "role": m.role,
            "content": [
                { "type": "text", "text": m.content },
                { "type": "image_url", "image_url": { "url": url } }
            ]
        }),
        None => json!({ "role": m.role, "content": m.content }),
    }));

    let mut total_input_tokens: u64 = 0;
    let mut total_output_tokens: u64 = 0;
    // Some local/self-hosted models (e.g. Ollama's gemma2) don't support
    // function calling. Drop tools after the first such rejection and
    // retry the same step instead of burning a step on it.
    let mut include_tools = true;

    let mut step = 0;
    while step < MAX_AGENT_STEPS {
        if *cancel_rx.borrow() {
            return Err(CANCELLED.to_string());
        }

        let mut body = json!({
            "model": model,
            "messages": convo,
        });
        if include_tools {
            body["tools"] = tools_schema();
            body["tool_choice"] = json!("auto");
        }

        let response = tokio::select! {
            biased;
            _ = cancel_rx.changed() => return Err(CANCELLED.to_string()),
            result = client.post(&url).bearer_auth(auth_token).json(&body).send() => {
                result.map_err(|e| format!("request failed: {e}"))?
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            if include_tools && text.to_lowercase().contains("does not support tools") {
                include_tools = false;
                continue;
            }
            return Err(format!("Provider API error ({status}): {text}"));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("failed to parse response: {e}"))?;

        total_input_tokens += data["usage"]["prompt_tokens"].as_u64().unwrap_or(0);
        total_output_tokens += data["usage"]["completion_tokens"].as_u64().unwrap_or(0);

        let message = data["choices"][0]["message"].clone();
        let tool_calls = message["tool_calls"].as_array().cloned().unwrap_or_default();

        if tool_calls.is_empty() {
            let text = strip_leaked_tool_syntax(message["content"].as_str().unwrap_or(""));
            emit_text(app, request_id, text);
            let _ = app.emit(
                "chat-usage",
                ChatUsagePayload {
                    request_id: request_id.to_string(),
                    model: model.to_string(),
                    input_tokens: total_input_tokens,
                    output_tokens: total_output_tokens,
                },
            );
            return Ok(());
        }

        convo.push(message);

        for call in &tool_calls {
            let name = call["function"]["name"].as_str().unwrap_or("");
            let args_str = call["function"]["arguments"].as_str().unwrap_or("{}");
            let args: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
            let path = args["path"].as_str().unwrap_or(".");
            let command = args["command"].as_str().unwrap_or("");
            let call_id = call["id"].as_str().unwrap_or("").to_string();

            let label = match name {
                "list_directory" => format!("@@tool:list_directory@@Listing `{path}`\n\n"),
                "read_file" => format!("@@tool:read_file@@Reading `{path}`\n\n"),
                "write_file" => format!("@@tool:write_file@@Writing `{path}`\n\n"),
                "run_command" => format!("@@tool:run_command@@Running `{command}`\n\n"),
                "get_clipboard" => "@@tool:get_clipboard@@Reading clipboard\n\n".to_string(),
                "set_clipboard" => "@@tool:set_clipboard@@Setting clipboard\n\n".to_string(),
                "take_screenshot" => "@@tool:take_screenshot@@Taking screenshot\n\n".to_string(),
                "list_processes" => "@@tool:list_processes@@Listing processes\n\n".to_string(),
                "kill_process" => {
                    let pid = args["pid"].as_u64().unwrap_or(0);
                    format!("@@tool:kill_process@@Killing process {pid}\n\n")
                }
                "open_app" => format!("@@tool:open_app@@Launching `{command}`\n\n"),
                "send_notification" => "@@tool:send_notification@@Sending notification\n\n".to_string(),
                other => format!("@@tool:{other}@@Running `{other}`\n\n"),
            };
            emit_text(app, request_id, label);

            let mut screenshot_data_url: Option<String> = None;

            let result = match name {
                "list_directory" => tool_list_directory(path),
                "read_file" => tool_read_file(path),
                "write_file" => {
                    let content = args["content"].as_str().unwrap_or("");
                    let resolved = resolve_path(path);
                    let old_content = std::fs::read_to_string(&resolved).ok();
                    match tool_write_file(path, content) {
                        Ok(message) => {
                            let _ = app.emit(
                                "file-change",
                                FileChangePayload {
                                    conversation_id: conversation_id.to_string(),
                                    path: resolved.display().to_string(),
                                    old_content,
                                    new_content: content.to_string(),
                                },
                            );
                            message
                        }
                        Err(err) => err,
                    }
                }
                "run_command" => {
                    let cwd = args["cwd"].as_str();
                    tool_run_command(command, cwd)
                }
                "get_clipboard" => tool_get_clipboard(),
                "set_clipboard" => {
                    let text = args["text"].as_str().unwrap_or("");
                    tool_set_clipboard(text)
                }
                "take_screenshot" => match tool_take_screenshot() {
                    Ok(data_url) => {
                        screenshot_data_url = Some(data_url);
                        "Screenshot captured; attached as an image below.".to_string()
                    }
                    Err(e) => e,
                },
                "list_processes" => tool_list_processes(),
                "kill_process" => {
                    let pid = args["pid"].as_u64().unwrap_or(0) as u32;
                    tool_kill_process(pid)
                }
                "open_app" => tool_open_app(command),
                "send_notification" => {
                    let title = args["title"].as_str().unwrap_or("Rofiant");
                    let body = args["body"].as_str().unwrap_or("");
                    match app.notification().builder().title(title).body(body).show() {
                        Ok(()) => "Notification sent.".to_string(),
                        Err(e) => format!("Error sending notification: {e}"),
                    }
                }
                other => format!("Unknown tool: {other}"),
            };

            convo.push(json!({
                "role": "tool",
                "tool_call_id": call_id,
                "content": result,
            }));

            if let Some(data_url) = screenshot_data_url {
                convo.push(json!({
                    "role": "user",
                    "content": [
                        { "type": "text", "text": "(screenshot attached above)" },
                        { "type": "image_url", "image_url": { "url": data_url } }
                    ]
                }));
            }
        }

        step += 1;
    }

    Err("Agent exceeded the maximum number of steps.".to_string())
}

#[tauri::command]
async fn generate_title(text: String, access_token: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = json!({
        "model": TITLE_MODEL,
        "messages": [
            { "role": "system", "content": TITLE_SYSTEM_PROMPT },
            { "role": "user", "content": text },
        ],
        "max_tokens": 20,
        "temperature": 0.3,
    });

    let response = client
        .post(GROQ_PROXY_URL)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Groq API error ({status}): {text}"));
    }

    let data: Value = response
        .json()
        .await
        .map_err(|e| format!("failed to parse response: {e}"))?;

    let title = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .trim_matches('"')
        .to_string();

    if title.is_empty() {
        return Err("empty title".to_string());
    }
    Ok(title)
}

#[tauri::command]
async fn transcribe_audio(
    audio_base64: String,
    mime_type: String,
    access_token: String,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|e| format!("invalid audio data: {e}"))?;

    let ext = if mime_type.contains("webm") {
        "webm"
    } else if mime_type.contains("ogg") {
        "ogg"
    } else if mime_type.contains("wav") {
        "wav"
    } else {
        "m4a"
    };

    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(format!("audio.{ext}"))
        .mime_str(&mime_type)
        .map_err(|e| format!("invalid mime type: {e}"))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", TRANSCRIBE_MODEL);

    let client = reqwest::Client::new();
    let response = client
        .post(GROQ_TRANSCRIBE_PROXY_URL)
        .bearer_auth(access_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Groq API error ({status}): {text}"));
    }

    let data: Value = response
        .json()
        .await
        .map_err(|e| format!("failed to parse response: {e}"))?;

    let text = data["text"].as_str().unwrap_or("").trim().to_string();
    Ok(text)
}

const OLLAMA_BASE_URL: &str = "http://localhost:11434";

#[tauri::command]
async fn ollama_list_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{OLLAMA_BASE_URL}/api/tags"))
        .send()
        .await
        .map_err(|e| format!("Could not reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama returned {}", resp.status()));
    }

    let data: Value = resp.json().await.map_err(|e| format!("bad response: {e}"))?;
    let names = data["models"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
        .collect();
    Ok(names)
}

#[tauri::command]
async fn ollama_pull_model(app: AppHandle, model: String) -> Result<(), String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{OLLAMA_BASE_URL}/api/pull"))
        .json(&json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Could not reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama pull error ({status}): {text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream error: {e}"))?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let line = line.strip_suffix(b"\n").unwrap_or(&line);
            if line.is_empty() {
                continue;
            }
            let Ok(v) = serde_json::from_slice::<Value>(line) else { continue };

            let status = v["status"].as_str().unwrap_or("").to_string();
            let error = v["error"].as_str().map(|s| s.to_string());
            let done = status == "success";

            let _ = app.emit(
                "ollama-pull-progress",
                OllamaPullProgress {
                    model: model.clone(),
                    status,
                    completed: v["completed"].as_u64(),
                    total: v["total"].as_u64(),
                    done,
                    error: error.clone(),
                },
            );

            if let Some(err) = error {
                return Err(err);
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn ollama_delete_model(model: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .delete(format!("{OLLAMA_BASE_URL}/api/delete"))
        .json(&json!({ "model": model }))
        .send()
        .await
        .map_err(|e| format!("Could not reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama delete error ({status}): {text}"));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ChatCancellations::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            ))]
            if let Some(main_webview) = app.get_webview("main") {
                let _ = main_webview.with_webview(|webview| {
                    use webkit2gtk::{PermissionRequestExt, WebViewExt};
                    webview.inner().connect_permission_request(|_, request| {
                        request.allow();
                        true
                    });
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_chat,
            stop_chat,
            generate_title,
            transcribe_audio,
            ollama_list_models,
            ollama_pull_model,
            ollama_delete_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
