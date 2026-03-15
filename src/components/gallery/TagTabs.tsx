// @TheTechMargin 2026
"use client";

interface TagTabsProps {
  tags: string[];
  active: string | null;
  onSelect: (tag: string | null) => void;
  tagCounts: Record<string, number>;
}

export default function TagTabs({
  tags,
  active,
  onSelect,
  tagCounts,
}: TagTabsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="hidden md:block scrollbar-hide overflow-x-auto -mx-4 px-4">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-[var(--el-cyan)] opacity-60 mr-1">TAGS</span>
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onSelect(active === tag ? null : tag)}
            className={`shrink-0 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-all ${
              active === tag
                ? "border border-[var(--el-cyan)] text-[var(--el-cyan)] bg-[rgba(0,255,255,0.1)] shadow-[0_0_8px_rgba(0,255,255,0.2)]"
                : "border border-[var(--el-primary-99)] text-[var(--el-primary-99)] hover:border-[var(--el-cyan)] hover:text-[var(--el-cyan)]"
            }`}
          >
            {tag} [{tagCounts[tag] || 0}]
          </button>
        ))}
      </div>
    </div>
  );
}
