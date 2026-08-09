import { describe, expect, it } from "vitest";
import { stripThinkTags } from "./think";

describe("stripThinkTags", () => {
  it("removes a closed think block", () => {
    expect(stripThinkTags("<think>reasoning</think>Hello")).toBe("Hello");
  });

  it("removes an unclosed think block mid-stream", () => {
    expect(stripThinkTags("<think>still reasoning")).toBe("");
  });

  it("leaves normal text untouched", () => {
    expect(stripThinkTags("Hello world")).toBe("Hello world");
  });

  it("handles multiple think blocks", () => {
    expect(stripThinkTags("<think>a</think>Hi<think>b</think> there")).toBe(
      "Hi there",
    );
  });

  it("stays correct streamed chunk-by-chunk when re-run on the raw buffer each time", () => {
    // Regression: the opening <think> tag can land in one SSE chunk and its
    // closing tag in a later one. Callers must accumulate the RAW text and
    // re-strip it fresh each chunk — re-stripping an already-stripped buffer
    // permanently destroys the opening tag before its pair ever arrives.
    const chunks = ["<thi", "nk>reason", "ing</th", "ink>\n\n", "Hi", " there"];
    let raw = "";
    let last = "";
    for (const chunk of chunks) {
      raw += chunk;
      last = stripThinkTags(raw);
    }
    expect(last).toBe("Hi there");
  });
});
