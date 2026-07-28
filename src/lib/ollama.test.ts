import { describe, it, expect, vi, beforeEach } from "vitest";
import { EASY_LOCAL_MODELS, pullOllamaModel } from "./ollama";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

describe("EASY_LOCAL_MODELS", () => {
  it("has no duplicate ids", () => {
    const ids = EASY_LOCAL_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has non-empty name, size, and desc", () => {
    for (const m of EASY_LOCAL_MODELS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.size.length).toBeGreaterThan(0);
      expect(m.desc.length).toBeGreaterThan(0);
    }
  });
});

describe("pullOllamaModel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it("only forwards progress events for the current request, and unlistens after invoke settles", async () => {
    let handler: (event: {
      payload: { requestId: string; model: string; status: string; done: boolean };
    }) => void = () => {};
    const unlisten = vi.fn();
    listenMock.mockImplementation((_event: string, cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(unlisten);
    });
    let capturedRequestId = "";
    invokeMock.mockImplementation(async (_cmd: string, args: { requestId: string; model: string }) => {
      capturedRequestId = args.requestId;
      // A stale event from some other in-flight pull — must be ignored.
      handler({ payload: { requestId: "stale-request-id", model: "llama3.2:1b", status: "pulling", done: false } });
      handler({ payload: { requestId: args.requestId, model: "llama3.2:1b", status: "pulling", done: false } });
    });

    const onProgress = vi.fn();
    await pullOllamaModel("llama3.2:1b", onProgress);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      requestId: capturedRequestId,
      model: "llama3.2:1b",
      status: "pulling",
      done: false,
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("still unlistens if invoke rejects", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);
    invokeMock.mockRejectedValue(new Error("pull failed"));

    await expect(pullOllamaModel("llama3.2:1b", vi.fn())).rejects.toThrow("pull failed");
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
