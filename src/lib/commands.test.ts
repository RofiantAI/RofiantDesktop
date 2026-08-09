import { describe, it, expect } from "vitest";
import { parseSlashCommand } from "./commands";

describe("parseSlashCommand", () => {
  it("returns null for text that isn't a slash command", () => {
    expect(parseSlashCommand("hello there")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
  });

  it("parses /clear", () => {
    expect(parseSlashCommand("/clear")).toEqual({ type: "clear" });
  });

  it("parses /rule create with the remaining text as the rule", () => {
    expect(parseSlashCommand("/rule create Always use TypeScript")).toEqual({
      type: "rule-create",
      text: "Always use TypeScript",
    });
  });

  it("parses /rule create with empty text", () => {
    expect(parseSlashCommand("/rule create")).toEqual({ type: "rule-create", text: "" });
  });

  it("parses /rule list", () => {
    expect(parseSlashCommand("/rule list")).toEqual({ type: "rule-list" });
  });

  it("parses /rule remove and /rule delete as the same command", () => {
    expect(parseSlashCommand("/rule remove 2")).toEqual({ type: "rule-remove", target: "2" });
    expect(parseSlashCommand("/rule delete 2")).toEqual({ type: "rule-remove", target: "2" });
  });

  it("falls back to unknown for an unrecognized /rule subcommand", () => {
    expect(parseSlashCommand("/rule bogus")).toEqual({ type: "unknown", raw: "/rule bogus" });
  });

  it("falls back to unknown for an unrecognized top-level command", () => {
    expect(parseSlashCommand("/nope")).toEqual({ type: "unknown", raw: "/nope" });
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseSlashCommand("  /clear  ")).toEqual({ type: "clear" });
  });

  it("parses /help", () => {
    expect(parseSlashCommand("/help")).toEqual({ type: "help" });
  });

  it("parses /new", () => {
    expect(parseSlashCommand("/new")).toEqual({ type: "new" });
  });

  it("parses /rename with the remaining text as the title", () => {
    expect(parseSlashCommand("/rename My Chat")).toEqual({ type: "rename", title: "My Chat" });
  });

  it("parses /rename with empty title", () => {
    expect(parseSlashCommand("/rename")).toEqual({ type: "rename", title: "" });
  });

  it("parses /export", () => {
    expect(parseSlashCommand("/export")).toEqual({ type: "export" });
  });
});
