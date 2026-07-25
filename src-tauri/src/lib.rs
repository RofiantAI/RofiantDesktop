use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Cursor;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::{oneshot, watch};

mod mcp;

const CANCELLED: &str = "__cancelled__";

#[derive(Default)]
struct ChatCancellations(Mutex<HashMap<String, watch::Sender<bool>>>);

// Keyed by "{request_id}:{call_id}" so a stale approval from a cancelled or
// finished request can never resolve a later one that happens to reuse a
// call_id.
#[derive(Default)]
struct ToolApprovals(Mutex<HashMap<String, oneshot::Sender<bool>>>);

// Toggled from the frontend's "minimize to tray" setting. When set, closing
// the main window hides it instead of quitting; the tray menu is then the
// only way to actually exit.
#[derive(Default)]
struct MinimizeToTray(AtomicBool);

#[tauri::command]
fn set_minimize_to_tray(state: State<MinimizeToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

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
struct ToolApprovalRequestPayload {
    request_id: String,
    approval_id: String,
    tool: String,
    summary: String,
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
const LOGFARE_PROXY_URL: &str = "https://nxwzaztltnqdslnvehva.supabase.co/functions/v1/logfare-proxy";

// reqwest::Client::new() has no timeout by default, so a dead network (e.g.
// offline, DNS black hole) hangs the request forever with no way for the
// user to recover short of restarting the app. connect_timeout fails fast
// when the host is unreachable; the longer overall `timeout` bounds normal
// bounded requests. ollama_pull_model is excluded from the overall timeout
// since a model download can legitimately run far longer than that.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("failed to build reqwest client")
}

fn streaming_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .expect("failed to build reqwest client")
}

// Mirrors the Logfare entries in src/lib/models.ts — kept in sync manually
// since the frontend and this backend live in separate build/deploy
// pipelines (same note as PRO_MODEL_IDS in supabase/functions/groq-proxy).
fn model_uses_logfare(model: &str) -> bool {
    model == "kiro-auto"
}

const LOGFARE_STATUS_URL: &str = "https://logfare.ai/v1/status";
const LOGFARE_BEST_MODEL_TTL: Duration = Duration::from_secs(3 * 60);

static LOGFARE_BEST_MODEL_CACHE: OnceLock<Mutex<Option<(Instant, String)>>> = OnceLock::new();

/// Reads the /v1/status endpoint of the given data and returns the
/// operational model_id with the highest uptime_percent over its reported
/// window, excluding kiro-auto itself (that's the router this replaces, not
/// a candidate for it). Operational models always outrank degraded ones,
/// but degraded models are still ranked against each other by uptime_percent
/// instead of being thrown out — during a broad outage every model can show
/// "degraded" at once, and picking the least-bad one still beats silently
/// falling back to unmodified "kiro-auto".
fn pick_best_logfare_model(status: &Value) -> Option<String> {
    fn rank(m: &Value) -> (bool, f64) {
        let operational = m["status"].as_str() == Some("operational");
        let uptime = m["uptime_percent"].as_f64().unwrap_or(0.0);
        (operational, uptime)
    }

    status["data"]
        .as_array()?
        .iter()
        .filter(|m| m["model_id"].as_str() != Some("kiro-auto"))
        .max_by(|a, b| rank(a).partial_cmp(&rank(b)).unwrap_or(std::cmp::Ordering::Equal))
        .and_then(|m| m["model_id"].as_str())
        .map(str::to_string)
}

/// Picks the best-performing Logfare model for "kiro-auto" by checking
/// https://logfare.ai/v1/status every LOGFARE_BEST_MODEL_TTL and caching the
/// result in between — Logfare's
/// own auto-router has no uptime guarantee of its own, so we do the picking
/// ourselves instead of trusting it. Falls back to "kiro-auto" unchanged if
/// the status check fails or times out, so a Logfare hiccup never blocks a
/// chat request.
async fn resolve_kiro_auto_model(client: &reqwest::Client) -> String {
    const FALLBACK: &str = "kiro-auto";

    if let Some((checked_at, model)) = LOGFARE_BEST_MODEL_CACHE.get_or_init(|| Mutex::new(None)).lock().unwrap().as_ref() {
        if checked_at.elapsed() < LOGFARE_BEST_MODEL_TTL {
            return model.clone();
        }
    }

    let picked = async {
        let resp = client.get(LOGFARE_STATUS_URL).send().await.ok()?;
        let status: Value = resp.json().await.ok()?;
        pick_best_logfare_model(&status)
    }
    .await
    .unwrap_or_else(|| FALLBACK.to_string());

    *LOGFARE_BEST_MODEL_CACHE.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some((Instant::now(), picked.clone()));
    picked
}

/// Lets the frontend show which concrete model "Kiro Auto" is currently
/// routing to (e.g. in the model picker), without waiting for an actual chat
/// request to trigger the status check.
#[tauri::command]
async fn get_kiro_auto_model() -> String {
    resolve_kiro_auto_model(&http_client()).await
}

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

// Noise directories skipped by recursive listing — dependency trees and build
// output that would otherwise drown out the actual project files.
const IGNORED_DIR_NAMES: &[&str] = &[
    ".git", "node_modules", "target", "dist", "build", ".venv", "venv", "__pycache__", ".next",
    ".cache",
];

fn tool_list_directory(path: &str, recursive: bool) -> String {
    let dir = resolve_path(path);
    if !recursive {
        return match std::fs::read_dir(&dir) {
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
        };
    }

    const MAX_ENTRIES: usize = 500;
    let mut items: Vec<String> = Vec::new();
    let mut stack = vec![dir.clone()];
    let mut truncated = false;
    while let Some(current) = stack.pop() {
        let entries = match std::fs::read_dir(&current) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            if items.len() >= MAX_ENTRIES {
                truncated = true;
                break;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if IGNORED_DIR_NAMES.contains(&name.as_str()) {
                continue;
            }
            let full = entry.path();
            let rel = full.strip_prefix(&dir).unwrap_or(&full).display().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                items.push(format!("{rel}/"));
                stack.push(full);
            } else {
                items.push(rel);
            }
        }
    }
    if items.is_empty() {
        return "(empty directory)".to_string();
    }
    items.sort();
    if truncated {
        items.push(format!(
            "... (truncated at {MAX_ENTRIES} entries; narrow the path or search a subdirectory)"
        ));
    }
    items.join("\n")
}

fn tool_edit_file(
    path: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<(String, String, String), String> {
    let file = resolve_path(path);
    let old_content = std::fs::read_to_string(&file)
        .map_err(|e| format!("Error reading file {}: {}", file.display(), e))?;

    if old_string.is_empty() {
        return Err("old_string must not be empty.".to_string());
    }

    let occurrences = old_content.matches(old_string).count();
    if occurrences == 0 {
        return Err(format!(
            "old_string not found in {}. Read the file first and copy the exact text \
(including whitespace) you want to replace.",
            file.display()
        ));
    }
    if occurrences > 1 && !replace_all {
        return Err(format!(
            "old_string appears {occurrences} times in {}. Include more surrounding context to \
make it unique, or set replace_all to true.",
            file.display()
        ));
    }

    let new_content = if replace_all {
        old_content.replace(old_string, new_string)
    } else {
        old_content.replacen(old_string, new_string, 1)
    };

    std::fs::write(&file, &new_content)
        .map_err(|e| format!("Error writing file {}: {}", file.display(), e))?;

    let replaced = if replace_all { occurrences } else { 1 };
    let message = format!(
        "Replaced {replaced} occurrence{} in {}",
        if replaced == 1 { "" } else { "s" },
        file.display()
    );
    Ok((message, old_content, new_content))
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

    // These target the literal root/home/glob, not a path or file that merely
    // starts with one (e.g. "rm -rf /tmp/build" or "rm -rf *.log" must not
    // match) — so the character right after the pattern must end the target
    // rather than continue it.
    let rooted_patterns: &[(&str, &str)] = &[
        ("rm -rf /", "recursive delete of the root filesystem"),
        ("rm -rf ~", "recursive delete of the home directory"),
        ("rm -rf *", "recursive delete with an unbounded wildcard"),
        ("rm -fr /", "recursive delete of the root filesystem"),
        ("rm -fr ~", "recursive delete of the home directory"),
        ("rm -fr *", "recursive delete with an unbounded wildcard"),
        ("rd /s /q c:\\", "recursive delete of the C: drive"),
        ("rmdir /s /q c:\\", "recursive delete of the C: drive"),
        ("del /f /s /q c:\\", "recursive delete of the C: drive"),
    ];
    for (pattern, reason) in rooted_patterns {
        if let Some(idx) = normalized.find(pattern) {
            let after = normalized.as_bytes().get(idx + pattern.len());
            let target_ends = matches!(after, None | Some(b' ') | Some(b';') | Some(b'&') | Some(b'|'));
            if target_ends {
                return Some(reason);
            }
        }
    }

    let patterns: &[(&str, &str)] = &[
        (":(){:|:&};:", "fork bomb"),
        ("mkfs", "formatting a disk/partition"),
        ("diskpart", "raw disk/partition management"),
        ("dd if=", "raw disk write via dd"),
        ("> /dev/sd", "overwriting a raw disk device"),
        ("> /dev/nvme", "overwriting a raw disk device"),
        ("> /dev/disk", "overwriting a raw disk device"),
        ("> /dev/hd", "overwriting a raw disk device"),
        ("chmod -r 777 /", "world-writable permissions on the root filesystem"),
        ("chmod -r 000 /", "removing all permissions on the root filesystem"),
        ("chown -r", "recursive ownership change (can lock the user out of their own files)"),
        ("shutdown", "shutting down the machine"),
        ("reboot", "rebooting the machine"),
        ("halt", "halting the machine"),
        ("sudo ", "privilege escalation (not permitted from the assistant)"),
        ("doas ", "privilege escalation (not permitted from the assistant)"),
        ("su -", "privilege escalation (not permitted from the assistant)"),
        (">> ~/.ssh/authorized_keys", "modifying SSH authorized_keys"),
        ("> ~/.ssh/authorized_keys", "overwriting SSH authorized_keys"),
        ("history -c", "clearing shell history"),
        (":>", "truncating a file via redirection shorthand"),
    ];

    // curl/wget are only blocked outright when piped into a shell — plain
    // downloads to a file are legitimate and handled by the generic patterns
    // above only for the authorized_keys/history cases. Piping a remote
    // script straight into an interpreter is the actual risk.
    let pipes_to_shell = (normalized.contains("curl") || normalized.contains("wget"))
        && (normalized.contains("| sh")
            || normalized.contains("| bash")
            || normalized.contains("|sh")
            || normalized.contains("|bash")
            || normalized.contains("| zsh")
            || normalized.contains("| sudo"));
    if pipes_to_shell {
        return Some("downloading and piping a remote script directly into a shell");
    }

    // Windows `format <drive>:` — checked by scanning tokens rather than a
    // bare "format " substring, since "format" alone is a common word in
    // build tool output (e.g. `npm run format`, PowerShell's `Format-List`).
    let words: Vec<&str> = normalized.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        if *word == "format" {
            if let Some(next) = words.get(i + 1) {
                let is_drive = next.len() == 2
                    && next.as_bytes()[1] == b':'
                    && next.as_bytes()[0].is_ascii_alphabetic();
                if is_drive {
                    return Some("formatting a disk/partition");
                }
            }
        }
    }

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

/// Returns a data: URL of a PNG screenshot of the monitor the user is currently
/// on (wherever the cursor is), or an error string on failure. Falls back to
/// the primary monitor if the cursor position can't be determined.
fn tool_take_screenshot(app: &AppHandle) -> Result<String, String> {
    use base64::Engine;

    let cursor = app.cursor_position().ok();
    let monitor = cursor
        .and_then(|pos| xcap::Monitor::from_point(pos.x as i32, pos.y as i32).ok())
        .map(Ok)
        .unwrap_or_else(|| {
            let monitors = xcap::Monitor::all().map_err(|e| format!("Error listing monitors: {e}"))?;
            monitors
                .into_iter()
                .find(|m| m.is_primary().unwrap_or(false))
                .ok_or_else(|| "No monitors found".to_string())
        })?;
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
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "List the whole subtree instead of just the top level. Use this to get oriented in a project before reading files. Skips .git, node_modules, target, dist, build, venv, __pycache__, .next, .cache. Defaults to false."
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
                "name": "edit_file",
                "description": "Make a precise, targeted edit to an existing text file by replacing one exact snippet with another, instead of rewriting the whole file. Prefer this over write_file when changing part of a file that already exists — read_file it first so old_string matches the file's exact text (including whitespace and indentation). old_string must appear exactly once in the file unless replace_all is set.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path, or a path relative to the home directory."
                        },
                        "old_string": {
                            "type": "string",
                            "description": "The exact existing text to replace. Include enough surrounding context to make it uniquely identify one location in the file."
                        },
                        "new_string": {
                            "type": "string",
                            "description": "The text to replace old_string with."
                        },
                        "replace_all": {
                            "type": "boolean",
                            "description": "Replace every occurrence of old_string instead of requiring exactly one match. Defaults to false."
                        }
                    },
                    "required": ["path", "old_string", "new_string"]
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
                            } else if cfg!(target_os = "macos") {
                                "The shell command to execute, e.g. 'ls -la' or 'open https://example.com'."
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
                } else if cfg!(target_os = "macos") {
                    "Launch an application, file, or URL without blocking (use this instead of run_command for opening GUI apps, since run_command waits for the process to exit). Examples: 'open -a Safari', 'code .', 'open https://example.com'."
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
tools: list_directory, read_file, write_file, edit_file, run_command, get_clipboard, set_clipboard, \
take_screenshot, list_processes, kill_process, open_app, and send_notification. \
These are not simulations — they execute for real on the user's machine. \
The user's home directory is exactly \
`{home}`. Use paths relative to it (e.g. 'Desktop/notes.txt') or prefixed with '~/' — never guess \
a literal username like /home/user/... or /Users/username/..., since it will resolve to the wrong \
place or fail with a permission error. Prefer open_app over run_command for launching GUI \
applications, since run_command waits for the process to exit and will hang. Use take_screenshot \
when you need to see what's currently on screen. Use tools proactively whenever they would help \
answer a request. Never claim you lack access to the file system, the terminal, the clipboard, \
running processes, or the screen — you have it. Act like a normal, capable assistant: just do the \
task. Only pause to ask before something destructive or irreversible (deleting data, killing an \
important process, overwriting something important, anything that can't be undone). \
\n\nWhen coding: to get oriented in a project, list_directory with recursive true before reading \
files one by one — don't rely on the user to describe the layout. For run_command, `grep -rn` (or \
`findstr /s` on Windows) works for searching file contents by keyword or symbol name. When changing \
an existing file, always prefer edit_file over write_file — read_file it first, then replace only \
the exact snippet that needs to change; reserve write_file for brand-new files or a genuine full \
rewrite, since re-sending an entire large file for a small change is slow and risks losing content \
the model didn't mean to touch. After editing code, if the project has an obvious way to check the \
change (a type checker, test suite, linter, build command), run it with run_command before calling \
the task done, and fix what it reports. Format replies \
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

#[tauri::command]
fn respond_tool_approval(
    approvals: State<'_, ToolApprovals>,
    approval_id: String,
    approved: bool,
) -> Result<(), String> {
    match approvals.0.lock().unwrap().remove(&approval_id) {
        Some(tx) => {
            let _ = tx.send(approved);
            Ok(())
        }
        None => Err("No pending approval with that id.".to_string()),
    }
}

/// Tools that touch the filesystem, run commands, kill processes, launch
/// other programs, or call out to an MCP server — anything with a real-world
/// side effect the user might not want. Read-only tools (listing/reading
/// files, reading the clipboard, screenshots, listing processes) run without
/// asking, same as before.
fn tool_needs_approval(name: &str) -> bool {
    mcp::is_mcp_tool(name)
        || matches!(name, "write_file" | "edit_file" | "run_command" | "kill_process" | "open_app")
}

fn tool_approval_summary(tool: &str, args: &Value) -> String {
    let path = args["path"].as_str().unwrap_or(".");
    let command = args["command"].as_str().unwrap_or("");
    match tool {
        "write_file" => format!("Write to `{path}`"),
        "edit_file" => format!("Edit `{path}`"),
        "run_command" => format!("Run `{command}`"),
        "kill_process" => format!("Kill process {}", args["pid"].as_u64().unwrap_or(0)),
        "open_app" => format!("Launch `{command}`"),
        other => format!("Run `{other}`"),
    }
}

/// Emits a tool-approval-request event and blocks until the frontend answers
/// via respond_tool_approval, or the request is cancelled. Only called for
/// tools tool_needs_approval flags — read-only tools skip this entirely.
async fn request_tool_approval(
    app: &AppHandle,
    request_id: &str,
    call_id: &str,
    tool: &str,
    args: &Value,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<bool, String> {
    let approval_id = format!("{request_id}:{call_id}");
    let (tx, rx) = oneshot::channel();
    app.state::<ToolApprovals>().0.lock().unwrap().insert(approval_id.clone(), tx);

    let _ = app.emit(
        "tool-approval-request",
        ToolApprovalRequestPayload {
            request_id: request_id.to_string(),
            approval_id: approval_id.clone(),
            tool: tool.to_string(),
            summary: tool_approval_summary(tool, args),
        },
    );

    tokio::select! {
        biased;
        _ = cancel_rx.changed() => {
            app.state::<ToolApprovals>().0.lock().unwrap().remove(&approval_id);
            Err(CANCELLED.to_string())
        }
        result = rx => Ok(result.unwrap_or(false)),
    }
}

/// Tool names the model can call — used to recognize leaked pseudo tool-call
/// notation even when the model drops the `<function=` wrapper around it.
const TOOL_NAMES: &[&str] = &[
    "list_directory",
    "read_file",
    "write_file",
    "run_command",
    "get_clipboard",
    "set_clipboard",
    "take_screenshot",
    "list_processes",
    "kill_process",
    "open_app",
    "send_notification",
];

/// Some weaker models (especially small local ones served through Ollama, or
/// Groq's gpt-oss under load) don't reliably emit structured tool_calls and
/// instead leak their internal pseudo tool-call notation as plain reply
/// text — either `<function=name>{...}</function>` or, less consistently,
/// a bare `name>{...}</function>` with the opening tag dropped entirely.
/// Strip both defensively so neither ever reaches the UI.
fn strip_leaked_tool_syntax(text: &str) -> String {
    const OPEN: &str = "<function=";
    const CLOSE: &str = "</function>";

    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    loop {
        let close_pos = match rest.find(CLOSE) {
            Some(p) => p,
            None => {
                result.push_str(rest);
                break;
            }
        };

        let head = &rest[..close_pos];
        let mut start = head.rfind(OPEN);
        for name in TOOL_NAMES {
            let marker = format!("{name}>{{");
            if let Some(pos) = head.rfind(&marker) {
                start = Some(start.map_or(pos, |s| s.max(pos)));
            }
        }

        match start {
            Some(start) => result.push_str(&head[..start]),
            // No recognizable opening; drop just the stray closing tag.
            None => result.push_str(head),
        }
        rest = &rest[close_pos + CLOSE.len()..];
    }
    result
}

/// Weaker local models (e.g. Ollama-served Qwen 2.5 Coder) sometimes skip the
/// structured tool_calls response entirely and instead write out one or more
/// well-formed `{"name": ..., "arguments": {...}}` JSON objects as the reply
/// text. Unlike the other two leak formats below, this one parses cleanly,
/// so rather than just hiding it, treat it as the tool_calls the model meant
/// to make and actually run them. Requires the ENTIRE trimmed reply to be
/// nothing but these objects (not just JSON appearing somewhere in prose) to
/// keep false positives on normal replies near zero.
fn parse_leaked_tool_calls(text: &str) -> Option<Vec<Value>> {
    let mut calls = Vec::new();
    let mut rest = text.trim();
    if rest.is_empty() {
        return None;
    }
    while !rest.is_empty() {
        if !rest.starts_with('{') {
            return None;
        }
        let bytes = rest.as_bytes();
        let mut depth = 0i32;
        let mut in_string = false;
        let mut escape = false;
        let mut end = None;
        for (i, &b) in bytes.iter().enumerate() {
            if in_string {
                if escape {
                    escape = false;
                } else if b == b'\\' {
                    escape = true;
                } else if b == b'"' {
                    in_string = false;
                }
                continue;
            }
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
        let end = end?;
        let value: Value = serde_json::from_str(&rest[..=end]).ok()?;
        let name = value.get("name")?.as_str()?.to_string();
        let arguments = value.get("arguments")?.as_object()?.clone();
        calls.push(json!({
            "id": format!("leaked-{}", calls.len()),
            "type": "function",
            "function": {
                "name": name,
                "arguments": serde_json::to_string(&arguments).unwrap_or_else(|_| "{}".to_string()),
            }
        }));
        rest = rest[end + 1..].trim_start();
    }
    Some(calls)
}

/// Qwen 3.6's tool-calling is documented as unreliable on Groq: instead of a
/// real tool_calls response it sometimes emits a bare, unclosed pseudo
/// function-call as reply text, e.g.:
///   function=
///   function=write_file>text="screenshot.png";path='~/Downloads'
/// This has no `</function>` close tag so `strip_leaked_tool_syntax` above
/// never sees it. The tool call itself never actually runs in this case —
/// this only keeps the malformed notation out of the user-visible reply.
fn strip_leaked_pseudo_tool_syntax(text: &str) -> String {
    text.lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed != "function=" && !(trimmed.starts_with("function=") && trimmed.contains('>'))
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
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
    let client = http_client();
    let (url, auth_token): (String, &str) = match &provider {
        Some(p) => (
            format!("{}/chat/completions", p.base_url.trim_end_matches('/')),
            p.api_key.as_str(),
        ),
        None if model_uses_logfare(model) => (LOGFARE_PROXY_URL.to_string(), access_token),
        None => (GROQ_PROXY_URL.to_string(), access_token),
    };
    // "kiro-auto" is the user-facing selection everywhere else (routing
    // above, the chat-usage event below) — only the outbound request body
    // uses whichever concrete model today's status check picked.
    let outbound_model: String = if model_uses_logfare(model) {
        resolve_kiro_auto_model(&client).await
    } else {
        model.to_string()
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

    // Only the vision-capable model accepts image content (must match
    // VISION_MODEL_ID in src/lib/models.ts) — sending it to any other model
    // gets the whole request rejected with "content must be a string".
    let model_supports_vision = model == "qwen/qwen3.6-27b";

    let mut convo: Vec<Value> = vec![json!({ "role": "system", "content": system_content })];
    convo.extend(rest.into_iter().map(|m| match m.image_data_url {
        Some(url) if model_supports_vision => json!({
            "role": m.role,
            "content": [
                { "type": "text", "text": m.content },
                { "type": "image_url", "image_url": { "url": url } }
            ]
        }),
        _ => json!({ "role": m.role, "content": m.content }),
    }));

    let mut total_input_tokens: u64 = 0;
    let mut total_output_tokens: u64 = 0;
    // Some local/self-hosted models (e.g. Ollama's gemma2) don't support
    // function calling. Drop tools after the first such rejection and
    // retry the same step instead of burning a step on it.
    let mut include_tools = true;
    // Some models (e.g. openai/gpt-oss-120b on Groq) occasionally emit a
    // malformed tool call as raw text instead of a real tool_calls entry,
    // which Groq rejects with 400 tool_use_failed. This is transient model
    // generation noise, not a real request error, so retry a few times
    // before giving up and surfacing it to the user.
    let mut tool_use_failed_retries = 0;
    const MAX_TOOL_USE_FAILED_RETRIES: u32 = 3;

    let mut step = 0;
    while step < MAX_AGENT_STEPS {
        if *cancel_rx.borrow() {
            return Err(CANCELLED.to_string());
        }

        let mut body = json!({
            "model": outbound_model,
            "messages": convo,
        });
        if include_tools {
            let mut tools = tools_schema();
            let mcp_tools = mcp::tool_schemas(app.state::<mcp::McpState>().inner()).await;
            if let Some(arr) = tools.as_array_mut() {
                arr.extend(mcp_tools);
            }
            body["tools"] = tools;
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
            if text.contains("tool_use_failed") && tool_use_failed_retries < MAX_TOOL_USE_FAILED_RETRIES {
                tool_use_failed_retries += 1;
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

        let mut message = data["choices"][0]["message"].clone();
        let mut tool_calls = message["tool_calls"].as_array().cloned().unwrap_or_default();

        let mut leaked_as_tool_calls = false;
        if tool_calls.is_empty() {
            if let Some(parsed) = parse_leaked_tool_calls(message["content"].as_str().unwrap_or("")) {
                tool_calls = parsed;
                leaked_as_tool_calls = true;
            }
        }

        if tool_calls.is_empty() {
            let text = strip_leaked_tool_syntax(message["content"].as_str().unwrap_or(""));
            let text = strip_leaked_pseudo_tool_syntax(&text);
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

        // Assistant responses that only make tool calls come back with
        // content: null. That's valid as a response, but replaying it back
        // as history on the next request gets rejected by some providers
        // ("content must be a string"), so normalize it before pushing.
        // Leaked-JSON tool calls need the same treatment: drop the raw JSON
        // text from history since the real tool_calls array replaces it.
        if message["content"].is_null() || leaked_as_tool_calls {
            message["content"] = json!("");
        }
        if leaked_as_tool_calls {
            message["tool_calls"] = json!(tool_calls);
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
                "edit_file" => format!("@@tool:edit_file@@Editing `{path}`\n\n"),
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

            let approved = if tool_needs_approval(name) {
                request_tool_approval(app, request_id, &call_id, name, &args, &mut cancel_rx).await?
            } else {
                true
            };

            let result = if !approved {
                emit_text(app, request_id, "@@tool:rejected@@Rejected — skipped\n\n".to_string());
                "The user rejected this action; it was not run.".to_string()
            } else if mcp::is_mcp_tool(name) {
                mcp::call_tool(app.state::<mcp::McpState>().inner(), name, args.clone()).await
            } else {
                match name {
                "list_directory" => tool_list_directory(path, args["recursive"].as_bool().unwrap_or(false)),
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
                "edit_file" => {
                    let old_string = args["old_string"].as_str().unwrap_or("");
                    let new_string = args["new_string"].as_str().unwrap_or("");
                    let replace_all = args["replace_all"].as_bool().unwrap_or(false);
                    let resolved = resolve_path(path);
                    match tool_edit_file(path, old_string, new_string, replace_all) {
                        Ok((message, old_content, new_content)) => {
                            let _ = app.emit(
                                "file-change",
                                FileChangePayload {
                                    conversation_id: conversation_id.to_string(),
                                    path: resolved.display().to_string(),
                                    old_content: Some(old_content),
                                    new_content,
                                },
                            );
                            message
                        }
                        Err(err) => err,
                    }
                }
                "run_command" => {
                    // Runs on a blocking-pool thread so a long-lived command
                    // (e.g. an install or build) can't stall this task's
                    // worker thread and make Stop/cancel unresponsive.
                    let cwd = args["cwd"].as_str().map(|s| s.to_string());
                    let command_owned = command.to_string();
                    tokio::task::spawn_blocking(move || tool_run_command(&command_owned, cwd.as_deref()))
                        .await
                        .unwrap_or_else(|e| format!("Internal error running command: {e}"))
                }
                "get_clipboard" => tool_get_clipboard(),
                "set_clipboard" => {
                    let text = args["text"].as_str().unwrap_or("");
                    tool_set_clipboard(text)
                }
                "take_screenshot" => match tool_take_screenshot(app) {
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
                }
            };

            convo.push(json!({
                "role": "tool",
                "tool_call_id": call_id,
                "content": result,
            }));

            if let Some(data_url) = screenshot_data_url {
                if model_supports_vision {
                    convo.push(json!({
                        "role": "user",
                        "content": [
                            { "type": "text", "text": "(screenshot attached above)" },
                            { "type": "image_url", "image_url": { "url": data_url } }
                        ]
                    }));
                } else {
                    convo.push(json!({
                        "role": "user",
                        "content": "(screenshot captured; this model can't view images — switch to Qwen 3.6 27B to see it)",
                    }));
                }
            }
        }

        step += 1;
    }

    Err("Agent exceeded the maximum number of steps.".to_string())
}

#[tauri::command]
async fn generate_title(text: String, access_token: String) -> Result<String, String> {
    let client = http_client();
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
        .text("model", TRANSCRIBE_MODEL)
        .text("response_format", "verbose_json");

    let client = http_client();
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
    if text.is_empty() {
        return Ok(text);
    }

    // whisper hallucinate phrases ("Thank you.", "you", ...) on silent/no-speech
    // audio; verbose_json segments expose no_speech_prob so we can detect and drop it.
    const NO_SPEECH_THRESHOLD: f64 = 0.6;
    if let Some(segments) = data["segments"].as_array() {
        if !segments.is_empty()
            && segments
                .iter()
                .all(|s| s["no_speech_prob"].as_f64().unwrap_or(0.0) > NO_SPEECH_THRESHOLD)
        {
            return Ok(String::new());
        }
    }

    Ok(text)
}

const OLLAMA_BASE_URL: &str = "http://localhost:11434";

#[tauri::command]
async fn ollama_list_models() -> Result<Vec<String>, String> {
    let client = http_client();
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

    let client = streaming_http_client();
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
    let client = http_client();
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

#[tauri::command]
async fn mcp_connect(
    state: State<'_, mcp::McpState>,
    config: mcp::McpServerConfig,
) -> Result<Vec<mcp::McpToolInfo>, String> {
    mcp::connect(state.inner(), config).await
}

#[tauri::command]
async fn mcp_disconnect(state: State<'_, mcp::McpState>, id: String) -> Result<(), String> {
    mcp::disconnect(state.inner(), &id).await;
    Ok(())
}

// Requests a Mica backdrop on Windows 11 (no-op with an ignored error on
// Windows 10, where the DWM attribute doesn't exist). Round corners are
// already DWM's default for a borderless window, so nothing to pin there.
#[cfg(windows)]
fn apply_windows_chrome(window: &tauri::WebviewWindow) {
    let _ = window_vibrancy::apply_mica(window, None);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMA-BUF renderer produces blurry/pixelated output on many
    // Linux Wayland setups (unlike Chromium-based apps). Must be set before
    // GTK/WebKit initializes. Respect a caller-provided override (main.rs
    // already does this check; mirrored here since this is also reachable
    // directly, e.g. in tests).
    #[cfg(target_os = "linux")]
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Must be registered before the deep-link plugin: on Windows/Linux, when
    // the OS "opens" our rofiant:// scheme while the app is already running,
    // it launches a second process rather than routing to the first one. The
    // "deep-link" feature on single-instance detects that and forwards the
    // URL into the running instance's deep-link plugin instead.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    // Gives the custom titlebar's maximize button real Windows 11 Snap
    // Layout support (the hover flyout), which a fully custom-drawn caption
    // button can't get on its own without native hit-test cooperation.
    #[cfg(windows)]
    {
        builder = builder.plugin(tauri_plugin_decorum::init());
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ChatCancellations::default())
        .manage(ToolApprovals::default())
        .manage(mcp::McpState::default())
        .manage(MinimizeToTray::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let minimize_to_tray = window.state::<MinimizeToTray>().0.load(Ordering::Relaxed);
                    if minimize_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .setup(|app| {
            let mut log_targets = vec![Target::new(TargetKind::LogDir {
                file_name: Some("rofiant".to_string()),
            })];
            if cfg!(debug_assertions) {
                log_targets.push(Target::new(TargetKind::Stdout));
            }
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets(log_targets)
                    .max_file_size(5_000_000)
                    .rotation_strategy(RotationStrategy::KeepOne)
                    .build(),
            )?;

            // Only needed for unbundled dev builds on Windows/Linux, where the
            // OS has no installer step to register the URL scheme handler.
            // macOS reads it from Info.plist (via bundle config) and packaged
            // Windows/Linux builds register it at install time.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
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

            #[cfg(windows)]
            if let Some(main_window) = app.get_webview_window("main") {
                use tauri_plugin_decorum::WebviewWindowExt;
                // Registers the window-proc hook Snap Layouts needs; our own
                // custom-drawn titlebar (src/components/TitleBar.tsx) keeps
                // rendering as-is, this only adds native hit-test cooperation.
                let _ = main_window.create_overlay_titlebar();
                apply_windows_chrome(&main_window);
            }

            let show_i = tauri::menu::MenuItem::with_id(app, "show", "Show Rofiant", true, None::<&str>)?;
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = tauri::menu::Menu::with_items(app, &[&show_i, &quit_i])?;

            tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_chat,
            stop_chat,
            respond_tool_approval,
            generate_title,
            transcribe_audio,
            ollama_list_models,
            ollama_pull_model,
            ollama_delete_model,
            mcp_connect,
            mcp_disconnect,
            set_minimize_to_tray,
            get_kiro_auto_model
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, _event| {
            // macOS: clicking the dock icon while the window is hidden (e.g.
            // minimized to tray) sends Reopen rather than relaunching the
            // app — without this the window would stay hidden with no way
            // back short of the tray menu.
            #[cfg(target_os = "macos")]
            {
                if let tauri::RunEvent::Reopen { .. } = _event {
                    if let Some(window) = _app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}

#[cfg(test)]
mod fs_tool_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Uses an absolute temp path so resolve_path passes it through unchanged,
    // rather than mutating the process-wide HOME env var (which would race
    // across tests running in parallel in this binary).
    fn temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("rofiant-test-{label}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolve_path_passes_through_absolute_paths() {
        assert_eq!(resolve_path("/etc/hosts"), PathBuf::from("/etc/hosts"));
    }

    #[test]
    fn resolve_path_expands_tilde_prefix() {
        assert_eq!(resolve_path("~/foo/bar"), PathBuf::from(home_dir()).join("foo/bar"));
    }

    #[test]
    fn resolve_path_expands_bare_tilde() {
        assert_eq!(resolve_path("~"), PathBuf::from(home_dir()));
    }

    #[test]
    fn resolve_path_joins_relative_paths_to_home() {
        assert_eq!(resolve_path("foo/bar"), PathBuf::from(home_dir()).join("foo/bar"));
    }

    #[test]
    fn write_then_read_file_round_trips() {
        let dir = temp_dir("write-read");
        let file = dir.join("hello.txt").display().to_string();
        assert!(tool_write_file(&file, "hello world").is_ok());
        assert_eq!(tool_read_file(&file), "hello world");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_file_creates_missing_parent_directories() {
        let dir = temp_dir("nested");
        let file = dir.join("a/b/c.txt").display().to_string();
        assert!(tool_write_file(&file, "nested").is_ok());
        assert_eq!(std::fs::read_to_string(dir.join("a/b/c.txt")).unwrap(), "nested");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_file_reports_missing_file() {
        let dir = temp_dir("missing");
        let file = dir.join("nope.txt").display().to_string();
        assert!(tool_read_file(&file).starts_with("Error reading file"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_directory_sorts_entries_and_marks_directories() {
        let dir = temp_dir("list");
        std::fs::write(dir.join("b.txt"), "").unwrap();
        std::fs::create_dir(dir.join("a_dir")).unwrap();
        assert_eq!(tool_list_directory(&dir.display().to_string(), false), "a_dir/\nb.txt");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_directory_reports_empty() {
        let dir = temp_dir("empty");
        assert_eq!(tool_list_directory(&dir.display().to_string(), false), "(empty directory)");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn edit_file_replaces_unique_occurrence() {
        let dir = temp_dir("edit-unique");
        let file = dir.join("f.txt");
        std::fs::write(&file, "foo bar baz").unwrap();
        let (msg, old, new) =
            tool_edit_file(&file.display().to_string(), "bar", "qux", false).unwrap();
        assert_eq!(old, "foo bar baz");
        assert_eq!(new, "foo qux baz");
        assert!(msg.contains("Replaced 1 occurrence"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn edit_file_rejects_ambiguous_match_without_replace_all() {
        let dir = temp_dir("edit-ambiguous");
        let file = dir.join("f.txt");
        std::fs::write(&file, "foo foo foo").unwrap();
        let result = tool_edit_file(&file.display().to_string(), "foo", "bar", false);
        assert!(result.unwrap_err().contains("appears 3 times"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn edit_file_replace_all_replaces_every_occurrence() {
        let dir = temp_dir("edit-all");
        let file = dir.join("f.txt");
        std::fs::write(&file, "foo foo foo").unwrap();
        let (msg, _old, new) =
            tool_edit_file(&file.display().to_string(), "foo", "bar", true).unwrap();
        assert_eq!(new, "bar bar bar");
        assert!(msg.contains("Replaced 3 occurrences"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn edit_file_rejects_empty_old_string() {
        let dir = temp_dir("edit-empty-old-string");
        let file = dir.join("f.txt");
        std::fs::write(&file, "foo").unwrap();
        assert!(tool_edit_file(&file.display().to_string(), "", "bar", false).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn edit_file_errors_when_old_string_not_found() {
        let dir = temp_dir("edit-notfound");
        let file = dir.join("f.txt");
        std::fs::write(&file, "foo").unwrap();
        assert!(tool_edit_file(&file.display().to_string(), "missing", "bar", false).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod blocked_command_tests {
    use super::is_blocked_command;

    #[test]
    fn blocks_literal_root_delete() {
        assert!(is_blocked_command("rm -rf /").is_some());
        assert!(is_blocked_command("rm -rf / ").is_some());
        assert!(is_blocked_command("sudo rm -rf /").is_some());
        assert!(is_blocked_command("RM -RF /").is_some());
    }

    #[test]
    fn blocks_literal_home_and_wildcard_delete() {
        assert!(is_blocked_command("rm -rf ~").is_some());
        assert!(is_blocked_command("rm -rf *").is_some());
        assert!(is_blocked_command("rm -fr ~").is_some());
    }

    #[test]
    fn does_not_block_deletes_scoped_to_a_subpath() {
        assert!(is_blocked_command("rm -rf /tmp/build").is_none());
        assert!(is_blocked_command("rm -rf ~/downloads/tmp").is_none());
        assert!(is_blocked_command("rm -rf *.log").is_none());
    }

    #[test]
    fn still_blocks_other_destructive_patterns() {
        assert!(is_blocked_command("mkfs.ext4 /dev/sda1").is_some());
        assert!(is_blocked_command("sudo reboot").is_some());
        assert!(is_blocked_command(":(){:|:&};:").is_some());
    }

    #[test]
    fn allows_ordinary_commands() {
        assert!(is_blocked_command("npm install").is_none());
        assert!(is_blocked_command("git status").is_none());
        assert!(is_blocked_command("ls -la /").is_none());
    }

    #[test]
    fn blocks_windows_drive_wipes() {
        assert!(is_blocked_command("rd /s /q C:\\").is_some());
        assert!(is_blocked_command("rmdir /s /q c:\\").is_some());
        assert!(is_blocked_command("del /f /s /q C:\\").is_some());
        assert!(is_blocked_command("diskpart").is_some());
        assert!(is_blocked_command("format c:").is_some());
        assert!(is_blocked_command("format D: /q").is_some());
    }

    #[test]
    fn does_not_block_format_as_an_ordinary_word() {
        assert!(is_blocked_command("npm run format").is_none());
        assert!(is_blocked_command("npm run format -- --check").is_none());
        assert!(is_blocked_command("cargo fmt --all").is_none());
        assert!(is_blocked_command("Get-Process | Format-List").is_none());
    }
}
