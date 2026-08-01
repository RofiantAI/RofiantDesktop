import { describe, expect, it } from "vitest";
import { tokenize } from "./syntax-highlight";

describe("tokenize", () => {
  it("returns unhighlighted text for unknown languages", () => {
    const code = "const x = 1;";
    expect(tokenize(code, "brainfuck")).toEqual([{ type: "text", text: code }]);
  });

  it("classifies keywords, strings, numbers, comments, and calls in JS", () => {
    const code = 'const x = 1; // hi\nfoo("bar");';
    const tokens = tokenize(code, "js");

    expect(tokens.some((t) => t.type === "keyword" && t.text === "const")).toBe(true);
    expect(tokens.some((t) => t.type === "number" && t.text === "1")).toBe(true);
    expect(tokens.some((t) => t.type === "comment" && t.text === "// hi")).toBe(true);
    expect(tokens.some((t) => t.type === "function" && t.text === "foo")).toBe(true);
    expect(tokens.some((t) => t.type === "string" && t.text === '"bar"')).toBe(true);
  });

  it("handles python-style comments and keywords", () => {
    const code = "def add(a, b):\n    return a + b  # sum";
    const tokens = tokenize(code, "python");

    expect(tokens.some((t) => t.type === "keyword" && t.text === "def")).toBe(true);
    expect(tokens.some((t) => t.type === "keyword" && t.text === "return")).toBe(true);
    expect(tokens.some((t) => t.type === "comment" && t.text === "# sum")).toBe(true);
  });

  it("reassembles to the original source", () => {
    const code = 'fn main() {\n    println!("hi {}", 42);\n}';
    const tokens = tokenize(code, "rust");
    expect(tokens.map((t) => t.text).join("")).toBe(code);
  });
});
