// @TheTechMargin 2026
// Shared action button for pipeline controls and utilities.

interface ActionButtonProps {
  label: string;
  description: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

export function ActionButton({ label, description, loading, disabled, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border p-3 text-left transition-colors ${
        disabled
          ? "border-[var(--el-amber)]/20 text-[var(--el-amber)]/40 cursor-not-allowed"
          : "border-[var(--el-primary-33)] text-[var(--el-primary-99)] hover:border-[var(--el-accent)] hover:bg-[var(--el-accent-28)]"
      }`}
    >
      <div className="text-xs tracking-wider flex items-center gap-2">
        {loading && <span className="inline-block w-2 h-2 bg-[var(--el-primary)] animate-pulse" />}
        {label}
      </div>
      <div className="text-[10px] text-[var(--el-primary-44)] mt-1">{description}</div>
    </button>
  );
}
