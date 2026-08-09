import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { ConfirmFn } from "../ConfirmDialog";

interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

const SKILLS_DIR_LABEL = "~/.rofiant/skills";

const TEMPLATE = `---
name: skill-name
description: One line describing what this skill does and when to use it — this is what the model sees before reading the rest of the file.
---

Write the full instructions for this skill here. This body is only loaded
when the model reads this file, so it can be as long and detailed as needed.
`;

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function SkillsSection({ confirm }: { confirm: ConfirmFn }) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [dirPath, setDirPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  function refresh() {
    setLoading(true);
    Promise.all([invoke<SkillInfo[]>("list_skills"), invoke<string>("skills_dir_path")])
      .then(([list, dir]) => {
        setSkills(list);
        setDirPath(dir);
      })
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function createSkill() {
    const slug = slugify(newName);
    if (!slug || !dirPath) return;
    const path = `${dirPath}/${slug}.md`;
    await invoke("write_file_content", {
      path,
      content: TEMPLATE.replace("skill-name", slug),
    });
    setNewName("");
    refresh();
    void openPath(path);
  }

  async function deleteSkill(s: SkillInfo) {
    const ok = await confirm({
      title: `Delete skill "${s.name}"?`,
      description: "This deletes the file from disk and can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await invoke("delete_skill", { path: s.path });
    refresh();
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[18px] font-bold mb-2">Skills</h1>
          <p className="text-[13px] text-foreground-muted">
            Drop markdown files with a <code>name</code> and <code>description</code> into{" "}
            <code>{SKILLS_DIR_LABEL}</code>. Rofiant always sees the name and description; it reads the full
            file only when a request matches one — same as Claude Code and other AI CLIs.
          </p>
        </div>
        <button
          type="button"
          disabled={!dirPath}
          onClick={() => dirPath && void revealItemInDir(dirPath)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open folder
        </button>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void createSkill()}
          placeholder="New skill name (e.g. pdf-forms)"
          className="flex-1 h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
        />
        <button
          type="button"
          onClick={() => void createSkill()}
          disabled={!slugify(newName) || !dirPath}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New skill
        </button>
        <button
          type="button"
          onClick={refresh}
          title="Rescan skills folder"
          aria-label="Rescan skills folder"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8">
          <Sparkles className="w-5 h-5 text-foreground-muted mb-2" />
          <div className="text-[13px] text-foreground-secondary">No skills yet</div>
          <div className="text-[12px] text-foreground-muted mt-0.5">
            Add one above, or drop a .md file into {SKILLS_DIR_LABEL} yourself.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {skills.map((s) => (
            <div
              key={s.path}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border"
            >
              <button
                type="button"
                onClick={() => void openPath(s.path)}
                title={s.path}
                className="min-w-0 text-left flex-1"
              >
                <span className="text-sm text-foreground font-medium truncate block">{s.name}</span>
                <span className="block text-xs text-foreground-muted truncate">{s.description}</span>
              </button>
              <button
                type="button"
                onClick={() => void deleteSkill(s)}
                title="Delete skill"
                aria-label={`Delete skill "${s.name}"`}
                className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-red-600 hover:bg-red-500/10 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
