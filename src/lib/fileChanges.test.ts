import { describe, it, expect, beforeEach } from "vitest";
import { loadFileChanges, saveFileChanges } from "./fileChanges";
import type { FileChange } from "../types";

function change(i: number): FileChange {
  return {
    id: `${i}`,
    conversationId: "c1",
    path: `file${i}.ts`,
    diff: "",
    timestamp: i,
  } as unknown as FileChange;
}

describe("fileChanges", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadFileChanges returns [] when nothing stored", () => {
    expect(loadFileChanges()).toEqual([]);
  });

  it("loadFileChanges returns [] on corrupt JSON", () => {
    localStorage.setItem("rofiant_file_changes", "{not json");
    expect(loadFileChanges()).toEqual([]);
  });

  it("saveFileChanges round-trips through loadFileChanges", () => {
    const changes = [change(1), change(2)];
    saveFileChanges(changes);
    expect(loadFileChanges()).toEqual(changes);
  });

  it("saveFileChanges caps stored entries at the most recent 500", () => {
    const changes = Array.from({ length: 600 }, (_, i) => change(i));
    saveFileChanges(changes);
    const loaded = loadFileChanges();
    expect(loaded).toHaveLength(500);
    expect(loaded[0].id).toBe("100");
    expect(loaded[loaded.length - 1].id).toBe("599");
  });
});
