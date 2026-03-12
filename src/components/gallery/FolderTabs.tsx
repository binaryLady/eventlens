// @TheTechMargin 2026
"use client";

interface FolderTabsProps {
  folders: string[];
  active: string;
  onSelect: (folder: string) => void;
  totalCount: number;
  folderCounts: Record<string, number>;
}

export default function FolderTabs({
  folders,
  active,
  onSelect,
  totalCount,
  folderCounts,
}: FolderTabsProps) {
  if (folders.length === 0) return null;

  return (
    <div className="hidden md:block scrollbar-hide overflow-x-auto -mx-4 px-4">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onSelect("")}
          className={`shrink-0 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-all ${
            active === ""
              ? "border border-[var(--el-magenta)] text-[var(--el-magenta)] bg-[var(--el-magenta-28)] glow-border-magenta"
              : "border border-[var(--el-green-99)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)]"
          }`}
        >
          ALL [{totalCount}]
        </button>
        {folders.map((folder) => (
          <button
            key={folder}
            onClick={() => onSelect(active === folder ? "" : folder)}
            className={`shrink-0 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-all ${
              active === folder
                ? "border border-[var(--el-magenta)] text-[var(--el-magenta)] bg-[var(--el-magenta-28)] glow-border-magenta"
                : "border border-[var(--el-green-99)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)]"
            }`}
          >
            {folder} [{folderCounts[folder] || 0}]
          </button>
        ))}
      </div>
    </div>
  );
}
