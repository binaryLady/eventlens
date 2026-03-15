// @TheTechMargin 2026
// Folder breakdown — shows photo count per Drive subfolder.

interface FolderBreakdownProps {
  folders: Array<{ name: string; count: number }>;
}

export function FolderBreakdown({ folders }: FolderBreakdownProps) {
  if (folders.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-xs tracking-wider mb-2 text-[var(--el-green-99)]">FOLDERS</h2>
      <div className="flex flex-wrap gap-2">
        {folders.map((f) => (
          <span
            key={f.name}
            className="border border-[var(--el-green-33)] px-2 py-1 text-[10px] tracking-wider text-[var(--el-green-99)]"
          >
            {f.name || "ROOT"} [{f.count}]
          </span>
        ))}
      </div>
    </div>
  );
}
