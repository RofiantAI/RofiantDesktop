// Lightweight regex-based tokenizer for code-block highlighting.
// Not a full grammar — good enough coverage for common langs without a dependency.

export type TokenType = "keyword" | "string" | "comment" | "number" | "function" | "text";

export interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS: Record<string, Set<string>> = {
  cLike: new Set([
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue", "class", "extends", "implements", "new",
    "this", "super", "import", "export", "default", "from", "as", "async", "await",
    "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of", "null",
    "undefined", "true", "false", "void", "static", "public", "private", "protected",
    "interface", "type", "enum", "readonly", "namespace", "declare", "yield", "delete",
  ]),
  python: new Set([
    "def", "return", "if", "elif", "else", "for", "while", "break", "continue", "class",
    "import", "from", "as", "try", "except", "finally", "raise", "with", "lambda",
    "None", "True", "False", "and", "or", "not", "in", "is", "pass", "yield", "async",
    "await", "global", "nonlocal", "assert", "del", "self",
  ]),
  rust: new Set([
    "fn", "let", "mut", "const", "return", "if", "else", "match", "for", "while", "loop",
    "break", "continue", "struct", "enum", "impl", "trait", "pub", "use", "mod", "crate",
    "self", "Self", "super", "as", "where", "dyn", "async", "await", "move", "unsafe",
    "true", "false", "None", "Some", "Ok", "Err", "static", "ref",
  ]),
  go: new Set([
    "func", "return", "if", "else", "for", "range", "break", "continue", "switch", "case",
    "default", "struct", "interface", "package", "import", "var", "const", "type", "go",
    "chan", "select", "defer", "map", "true", "false", "nil", "iota",
  ]),
  java: new Set([
    "public", "private", "protected", "class", "interface", "extends", "implements",
    "static", "final", "void", "new", "return", "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue", "try", "catch", "finally", "throw", "throws",
    "import", "package", "this", "super", "true", "false", "null", "enum", "abstract",
  ]),
  ruby: new Set([
    "def", "end", "return", "if", "elsif", "else", "unless", "for", "while", "break",
    "next", "class", "module", "require", "require_relative", "attr_accessor", "do",
    "true", "false", "nil", "self", "yield", "begin", "rescue", "ensure", "raise",
  ]),
  bash: new Set([
    "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "case",
    "esac", "function", "return", "echo", "export", "local", "set", "break", "continue",
  ]),
  sql: new Set([
    "select", "from", "where", "insert", "into", "values", "update", "set", "delete",
    "create", "table", "alter", "drop", "join", "left", "right", "inner", "outer", "on",
    "group", "by", "order", "having", "limit", "and", "or", "not", "null", "as", "distinct",
  ]),
};

const LANG_ALIASES: Record<string, keyof typeof KEYWORDS | "json" | "css" | "html"> = {
  js: "cLike", jsx: "cLike", ts: "cLike", tsx: "cLike", javascript: "cLike", typescript: "cLike",
  mjs: "cLike", cjs: "cLike", c: "java", cpp: "java", "c++": "java", cs: "java", csharp: "java",
  swift: "cLike", kotlin: "cLike",
  py: "python", python: "python", python3: "python",
  rs: "rust", rust: "rust",
  go: "go", golang: "go",
  java: "java",
  rb: "ruby", ruby: "ruby",
  sh: "bash", bash: "bash", shell: "bash", zsh: "bash",
  sql: "sql",
  json: "json", jsonc: "json",
  css: "css", scss: "css", less: "css",
  html: "html", xml: "html", svg: "html",
};

const COMMENT_STYLES: Record<string, { line?: RegExp; block?: RegExp }> = {
  cLike: { line: /\/\/[^\n]*/y, block: /\/\*[\s\S]*?(\*\/|$)/y },
  java: { line: /\/\/[^\n]*/y, block: /\/\*[\s\S]*?(\*\/|$)/y },
  go: { line: /\/\/[^\n]*/y, block: /\/\*[\s\S]*?(\*\/|$)/y },
  rust: { line: /\/\/[^\n]*/y, block: /\/\*[\s\S]*?(\*\/|$)/y },
  css: { block: /\/\*[\s\S]*?(\*\/|$)/y },
  python: { line: /#[^\n]*/y },
  bash: { line: /#[^\n]*/y },
  sql: { line: /--[^\n]*/y },
  ruby: { line: /#[^\n]*/y },
};

const STRING_RE = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y;
const NUMBER_RE = /\b0[xXbBoO][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y;
const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;

export function tokenize(code: string, lang: string): Token[] {
  const family = LANG_ALIASES[lang.toLowerCase()];
  if (!family || family === "html") return [{ type: "text", text: code }];

  const keywords = family === "json" || family === "css" ? undefined : KEYWORDS[family];
  const comments = COMMENT_STYLES[family];
  const tokens: Token[] = [];
  let i = 0;

  const push = (type: TokenType, text: string) => {
    if (tokens.length > 0 && tokens[tokens.length - 1].type === type) {
      tokens[tokens.length - 1].text += text;
    } else {
      tokens.push({ type, text });
    }
  };

  while (i < code.length) {
    let matched = false;

    if (comments?.block) {
      comments.block.lastIndex = i;
      const m = comments.block.exec(code);
      if (m) {
        push("comment", m[0]);
        i += m[0].length;
        matched = true;
      }
    }
    if (!matched && comments?.line) {
      comments.line.lastIndex = i;
      const m = comments.line.exec(code);
      if (m) {
        push("comment", m[0]);
        i += m[0].length;
        matched = true;
      }
    }
    if (!matched) {
      STRING_RE.lastIndex = i;
      const m = STRING_RE.exec(code);
      if (m) {
        push("string", m[0]);
        i += m[0].length;
        matched = true;
      }
    }
    if (!matched) {
      NUMBER_RE.lastIndex = i;
      const m = NUMBER_RE.exec(code);
      if (m) {
        push("number", m[0]);
        i += m[0].length;
        matched = true;
      }
    }
    if (!matched) {
      IDENT_RE.lastIndex = i;
      const m = IDENT_RE.exec(code);
      if (m) {
        const word = m[0];
        const isCall = code[i + word.length] === "(";
        if (keywords?.has(word)) {
          push("keyword", word);
        } else if (isCall) {
          push("function", word);
        } else {
          push("text", word);
        }
        i += word.length;
        matched = true;
      }
    }
    if (!matched) {
      push("text", code[i]);
      i += 1;
    }
  }

  return tokens;
}
