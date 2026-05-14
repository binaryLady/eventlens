// @TheTechMargin 2026
import { Suspense } from "react";
import PhotoGallery from "@/components/gallery/PhotoGallery";
import GridSkeleton from "@/components/gallery/GridSkeleton";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--el-bg)] grid-bg"><GridSkeleton /></div>}>
      <PhotoGallery />
    </Suspense>
  );
}
