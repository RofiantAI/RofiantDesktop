import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

const EDGE = 6;
const CORNER = 12;

type Direction = Parameters<typeof appWindow.startResizeDragging>[0];

const edges: { direction: Direction; cursor: string; className: string; orientation: "horizontal" | "vertical" }[] = [
  { direction: "North", cursor: "n-resize", className: "top-0 left-0 right-0", orientation: "horizontal" },
  { direction: "South", cursor: "s-resize", className: "bottom-0 left-0 right-0", orientation: "horizontal" },
  { direction: "West", cursor: "w-resize", className: "left-0 top-0 bottom-0", orientation: "vertical" },
  { direction: "East", cursor: "e-resize", className: "right-0 top-0 bottom-0", orientation: "vertical" },
];

const corners: { direction: Direction; cursor: string; className: string }[] = [
  { direction: "NorthWest", cursor: "nw-resize", className: "top-0 left-0" },
  { direction: "NorthEast", cursor: "ne-resize", className: "top-0 right-0" },
  { direction: "SouthWest", cursor: "sw-resize", className: "bottom-0 left-0" },
  { direction: "SouthEast", cursor: "se-resize", className: "bottom-0 right-0" },
];

// Use the native OS-driven resize (xdg_toplevel resize on Wayland, matching
// on X11/Windows/macOS) rather than computing size+position ourselves.
// Wayland does not let a client reposition its own window, so a manual
// setPosition()-based drag mis-anchors on the North/West edges.
export function ResizeHandles() {
  return (
    <>
      {edges.map((e) => (
        <div
          key={e.direction}
          onMouseDown={(evt) => {
            if (evt.buttons !== 1) return;
            evt.preventDefault();
            void appWindow.startResizeDragging(e.direction);
          }}
          className={`fixed z-50 ${e.className}`}
          style={{
            [e.orientation === "horizontal" ? "height" : "width"]: EDGE,
            cursor: e.cursor,
          }}
        />
      ))}
      {corners.map((c) => (
        <div
          key={c.direction}
          onMouseDown={(evt) => {
            if (evt.buttons !== 1) return;
            evt.preventDefault();
            void appWindow.startResizeDragging(c.direction);
          }}
          className={`fixed z-50 ${c.className}`}
          style={{ width: CORNER, height: CORNER, cursor: c.cursor }}
        />
      ))}
    </>
  );
}
