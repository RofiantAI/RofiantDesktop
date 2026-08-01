// A real, interactive terminal for the "changed files" sidebar: spawns the
// user's login shell behind a pseudo-terminal (so full-screen programs like
// vim/htop/less and job control work) and streams its output to the frontend
// as raw bytes over a Tauri event, decoded and rendered there with xterm.js.
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState(Mutex<HashMap<String, PtySession>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyOutputPayload {
    id: String,
    data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExitPayload {
    id: String,
}

fn shell_command() -> CommandBuilder {
    if cfg!(target_os = "windows") {
        CommandBuilder::new("powershell.exe")
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut cmd = CommandBuilder::new(shell);
        // Login shell picks up the user's usual PATH/aliases (nvm, cargo,
        // etc.) instead of the minimal env the app was launched with.
        cmd.arg("-l");
        cmd
    }
}

pub fn spawn(
    app: AppHandle,
    state: &PtyState,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Error opening pty: {e}"))?;

    let mut cmd = shell_command();
    if let Some(dir) = cwd.or_else(dirs_home) {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Error spawning shell: {e}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Error cloning pty reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Error taking pty writer: {e}"))?;

    state.0.lock().unwrap().insert(
        id.clone(),
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app.emit("pty-output", PtyOutputPayload { id: id.clone(), data });
                }
                Err(_) => break,
            }
        }
        let _ = app.emit("pty-exit", PtyExitPayload { id });
    });

    Ok(())
}

pub fn write(state: &PtyState, id: &str, data: &str) -> Result<(), String> {
    let mut sessions = state.0.lock().unwrap();
    let session = sessions.get_mut(id).ok_or("No terminal session with that id")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Error writing to pty: {e}"))
}

pub fn resize(state: &PtyState, id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.0.lock().unwrap();
    let session = sessions.get(id).ok_or("No terminal session with that id")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Error resizing pty: {e}"))
}

pub fn kill(state: &PtyState, id: &str) -> Result<(), String> {
    let mut sessions = state.0.lock().unwrap();
    if let Some(mut session) = sessions.remove(id) {
        let _ = session.child.kill();
    }
    Ok(())
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()
}
