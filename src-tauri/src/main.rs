// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(target_os = "linux")]
  {
    // Works around WebKitGTK DMA-BUF renderer stutter/tearing seen on
    // some Mesa/AMD + Wayland combos (e.g. Fedora).
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
      std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
  }

  app_lib::run();
}
