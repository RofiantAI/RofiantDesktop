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

    // Native Wayland ignores client-requested window positions (compositor
    // decides placement), which breaks the desktop widget's corner anchor.
    // Run through XWayland instead, which honors set_position like X11.
    if std::env::var("GDK_BACKEND").is_err() {
      std::env::set_var("GDK_BACKEND", "x11");
    }
  }

  app_lib::run();
}
