// @TheTechMargin 2026
// Recent pipeline errors — shows filenames and error messages.

interface ErrorListProps {
  errors: Array<{ filename: string; error: string }>;
}

export function ErrorList({ errors }: ErrorListProps) {
  if (errors.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-sm tracking-wider mb-3 text-[var(--el-red)]">RECENT ERRORS</h2>
      <div className="border border-[var(--el-red-33)] bg-[var(--el-red-08)] max-h-40 overflow-y-auto">
        {errors.map((e, i) => (
          <div key={i} className="px-3 py-2 text-xs border-b border-[var(--el-red-11)] last:border-0">
            <span className="text-[var(--el-red)]">{e.filename}</span>
            <span className="text-[var(--el-red-88)] ml-2">{e.error}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
