import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendChatMessage } from "./groq";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

type Handler = (event: { payload: unknown }) => void;

function makeListenMock() {
  const handlers = new Map<string, Handler>();
  const unlistens = new Map<string, ReturnType<typeof vi.fn>>();
  listenMock.mockImplementation((event: string, cb: Handler) => {
    handlers.set(event, cb);
    const unlisten = vi.fn();
    unlistens.set(event, unlisten);
    return Promise.resolve(unlisten);
  });
  return {
    fire: (event: string, payload: unknown) => handlers.get(event)?.({ payload }),
    unlistenFor: (event: string) => unlistens.get(event),
  };
}

describe("sendChatMessage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it("resolves on chat-done and ignores events for other request ids", async () => {
    const { fire } = makeListenMock();
    invokeMock.mockResolvedValue(undefined);
    let requestId = "";

    const onDelta = vi.fn();
    const promise = sendChatMessage(
      [{ role: "user", content: "hi" }],
      "model-x",
      "conv-1",
      "token",
      onDelta,
      undefined,
      (id) => (requestId = id),
    );

    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
    fire("chat-chunk", { request_id: "not-this-one", delta: "ignored", replace: false });
    fire("chat-chunk", { request_id: requestId, delta: "hello", replace: false });
    fire("chat-done", { request_id: "not-this-one" });
    fire("chat-done", { request_id: requestId });

    await promise;
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith("hello", false);
  });

  it("rejects with the error message on chat-error", async () => {
    const { fire } = makeListenMock();
    invokeMock.mockResolvedValue(undefined);
    let requestId = "";

    const promise = sendChatMessage(
      [{ role: "user", content: "hi" }],
      "model-x",
      "conv-1",
      "token",
      vi.fn(),
      undefined,
      (id) => (requestId = id),
    );

    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
    fire("chat-error", { request_id: requestId, message: "boom" });

    await expect(promise).rejects.toThrow("boom");
  });

  it("rejects when the initial invoke call fails", async () => {
    makeListenMock();
    invokeMock.mockRejectedValue(new Error("network down"));

    await expect(
      sendChatMessage([{ role: "user", content: "hi" }], "model-x", "conv-1", "token", vi.fn()),
    ).rejects.toThrow("network down");
  });

  it("forwards usage and tool-approval events for the matching request id", async () => {
    const { fire } = makeListenMock();
    invokeMock.mockResolvedValue(undefined);
    let requestId = "";
    const onUsage = vi.fn();
    const onToolApproval = vi.fn();

    const promise = sendChatMessage(
      [{ role: "user", content: "hi" }],
      "model-x",
      "conv-1",
      "token",
      vi.fn(),
      onUsage,
      (id) => (requestId = id),
      undefined,
      onToolApproval,
    );

    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
    fire("chat-usage", {
      request_id: requestId,
      model: "model-x",
      input_tokens: 10,
      output_tokens: 20,
    });
    fire("tool-approval-request", {
      requestId,
      approvalId: "a1",
      tool: "read_file",
      summary: "Reading foo.ts",
    });
    fire("chat-done", { request_id: requestId });
    await promise;

    expect(onUsage).toHaveBeenCalledWith({ model: "model-x", inputTokens: 10, outputTokens: 20 });
    expect(onToolApproval).toHaveBeenCalledWith({
      approvalId: "a1",
      tool: "read_file",
      summary: "Reading foo.ts",
    });
  });
});
