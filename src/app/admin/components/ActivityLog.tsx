// @TheTechMargin 2026
// Activity log — scrollable feed of pipeline actions and results.

interface ActivityLogProps {
  entries: string[];
  lastProcessed: string | null;
}

export function ActivityLog({ entries, lastProcessed }: ActivityLogProps) {
  return (
    <div>
      <h2 className="text-sm tracking-wider mb-3 text-[var(--el-green-99)]">ACTIVITY LOG</h2>
      <div className="border border-[var(--el-green-33)] bg-[var(--el-green-08)] h-48 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <p className="text-xs text-[var(--el-green-44)]">
            No activity yet. Use Pipeline buttons above to process photos.
          </p>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="text-xs text-[var(--el-green-99)] mb-1">
              {entry}
            </div>
          ))
        )}
      </div>
      {lastProcessed && (
        <div className="mt-4 text-xs text-[var(--el-green-44)]">
          Last indexed: {new Date(lastProcessed).toLocaleString()}
        </div>
      )}
    </div>
  );
}
