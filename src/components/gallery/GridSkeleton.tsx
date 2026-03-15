// @TheTechMargin 2026

export default function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] border border-[var(--el-primary-15)] skeleton-terminal"
          style={{ '--delay': `${i * 0.15}s` } as React.CSSProperties}
        >
          <div className="relative h-full w-full p-2">
            <div className="absolute top-1 left-1 w-3 h-3 border-t border-l border-[var(--el-primary-33)]" />
            <div className="absolute top-1 right-1 w-3 h-3 border-t border-r border-[var(--el-primary-33)]" />
            <div className="absolute bottom-1 left-1 w-3 h-3 border-b border-l border-[var(--el-primary-33)]" />
            <div className="absolute bottom-1 right-1 w-3 h-3 border-b border-r border-[var(--el-primary-33)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[var(--el-primary-22)] text-lg">+</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
