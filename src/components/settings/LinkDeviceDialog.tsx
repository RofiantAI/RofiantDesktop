import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabase";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type Phase = "loading" | "waiting" | "linked" | "expired" | "error";

// Mirrors the mobile app's in-app QR scanner: the QR just carries the
// pairing code, no URL scheme — nothing hands this off to the OS.
function qrPayload(code: string): string {
  return `rofiant-link:${code}`;
}

export function LinkDeviceDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    async function start() {
      const { data, error } = await supabase.functions.invoke<{ code: string }>("link-device", {
        body: { action: "create" },
      });
      if (cancelled.current) return;
      if (error || !data?.code) {
        setPhase("error");
        return;
      }

      const dataUrl = await QRCode.toDataURL(qrPayload(data.code), { margin: 1, width: 240 });
      if (cancelled.current) return;
      setQrDataUrl(dataUrl);
      setPhase("waiting");

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled.current) return;

        const { data: statusData } = await supabase.functions.invoke<{
          status: "pending" | "approved" | "expired";
          token_hash?: string;
        }>("link-device", { body: { action: "status", code: data.code } });
        if (cancelled.current || !statusData) continue;

        if (statusData.status === "expired") {
          setPhase("expired");
          return;
        }
        if (statusData.status === "approved" && statusData.token_hash) {
          // verifyOtp updates supabase-js's own session internally — App.tsx's
          // existing onAuthStateChange listener picks this up automatically,
          // same as every other sign-in path.
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: statusData.token_hash,
            type: "magiclink",
          });
          if (!verifyError) {
            // Records this session against the link so mobile's Devices list
            // can unlink it later — best-effort, never blocks sign-in.
            try {
              await supabase.functions.invoke("link-device", { body: { action: "confirm", code: data.code } });
            } catch (confirmError) {
              console.error("link-device confirm failed", confirmError);
            }
          }
          setPhase(verifyError ? "error" : "linked");
          return;
        }
      }
      if (!cancelled.current) setPhase("expired");
    }

    void start();
    return () => {
      cancelled.current = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl p-5 space-y-4 animate-[modalIn_180ms_ease-out]"
      >
        <div className="text-[13px] font-medium text-foreground">Link a device</div>

        <div className="flex flex-col items-center gap-3 py-2">
          {phase === "loading" && (
            <div className="w-[240px] h-[240px] flex items-center justify-center text-[12px] text-foreground-muted">
              Generating code…
            </div>
          )}
          {phase === "waiting" && qrDataUrl && (
            <>
              <img src={qrDataUrl} alt="Scan with Rofiant on your phone" className="rounded-md" />
              <div className="text-[12px] text-foreground-muted text-center leading-relaxed">
                Open Rofiant on your phone, go to Account &rarr; Link a device, and scan this code.
              </div>
            </>
          )}
          {phase === "linked" && (
            <div className="text-[13px] text-foreground text-center py-6">Device linked. You're signed in.</div>
          )}
          {phase === "expired" && (
            <div className="text-[13px] text-foreground-secondary text-center py-6">
              This code expired. Close and try again.
            </div>
          )}
          {phase === "error" && (
            <div className="text-[13px] text-foreground-secondary text-center py-6">
              Something went wrong. Close and try again.
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
          >
            {phase === "linked" ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
