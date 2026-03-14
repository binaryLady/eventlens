// @TheTechMargin 2026

interface EmptyStateProps {
  type: "no-assets" | "no-results" | "no-match" | "error";
  query?: string;
  onRetry?: () => void;
}

export default function EmptyState({ type, query, onRetry }: EmptyStateProps) {
  if (type === "error") {
    return (
      <div className="flex flex-col items-center py-20 text-center border border-[#ff000033] bg-[#ff000008] p-8">
        <p className="text-xs font-mono uppercase tracking-wider text-red-500">
          &#9888; CONNECTION ERROR — VERIFY GOOGLE SHEET ACCESS
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 border border-[var(--el-green-99)] px-6 py-2 text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] hover:bg-[var(--el-magenta-28)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] transition-all"
          >
            [RETRY CONNECTION]
          </button>
        )}
      </div>
    );
  }

  if (type === "no-assets") {
    return (
      <div className="flex flex-col items-center py-20 text-center border border-[var(--el-green-99)] p-8">
        <div className="text-4xl text-[var(--el-green-d9)] mb-4">+</div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)]">
          {"NO ASSETS DETECTED // UPLOAD PHOTO TO BEGIN FACIAL SCAN"}
        </p>
      </div>
    );
  }

  if (type === "no-match") {
    return (
      <div className="flex flex-col items-center py-20 text-center border border-[var(--el-green-99)] p-8">
        <div className="text-4xl text-[var(--el-green-d9)] mb-4 animate-crosshair-spin">&#x2295;</div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)]">
          {"NO FACIAL MATCH DETECTED // TRY HIGHER RESOLUTION INPUT"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-20 text-center border border-[var(--el-green-99)] p-8">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)]">
        NO MATCHES FOR &quot;{query?.toUpperCase()}&quot; {"//"} TRY ALTERNATE QUERY
      </p>
    </div>
  );
}
