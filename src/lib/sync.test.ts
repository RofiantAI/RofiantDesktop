import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({ supabase: { from: fromMock } }));

import {
  fetchRemoteConversations,
  touchRemoteConversation,
  ensureRemoteConversation,
} from "./sync";

function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "insert", "update", "delete", "single"];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve);
  return builder;
}

describe("fetchRemoteConversations", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("sorts messages within each conversation by created_at ascending", async () => {
    fromMock.mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            id: "c1",
            title: "Conversation 1",
            updated_at: "2024-01-02T00:00:00Z",
            pinned: null,
            messages: [
              { role: "assistant", content: "second", created_at: "2024-01-01T00:02:00Z", image_data_url: null },
              { role: "user", content: "first", created_at: "2024-01-01T00:01:00Z", image_data_url: null },
            ],
          },
        ],
        error: null,
      }),
    );

    const result = await fetchRemoteConversations("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].messages.map((m) => m.content)).toEqual(["first", "second"]);
    expect(result[0].pinned).toBe(false);
    expect(result[0].status).toBe("idle");
  });

  it("maps null image_data_url to undefined", async () => {
    fromMock.mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            id: "c1",
            title: "t",
            updated_at: "2024-01-01T00:00:00Z",
            pinned: true,
            messages: [
              { role: "user", content: "hi", created_at: "2024-01-01T00:00:00Z", image_data_url: null },
            ],
          },
        ],
        error: null,
      }),
    );

    const result = await fetchRemoteConversations("user-1");
    expect(result[0].messages[0].imageDataUrl).toBeUndefined();
  });

  it("returns an empty array and logs on error instead of throwing", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: { message: "boom" } }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchRemoteConversations("user-1");
    expect(result).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("ensureRemoteConversation", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns the new conversation id on success", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: { id: "new-id" }, error: null }));
    const id = await ensureRemoteConversation("user-1", "Title");
    expect(id).toBe("new-id");
  });

  it("returns null and logs on error", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: { message: "boom" } }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await ensureRemoteConversation("user-1", "Title");
    expect(id).toBeNull();
    errSpy.mockRestore();
  });
});

describe("touchRemoteConversation", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("logs but does not throw on error", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: { message: "boom" } }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(touchRemoteConversation("c1", "New title")).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
