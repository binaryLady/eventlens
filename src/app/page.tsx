// @TheTechMargin 2026
"use client";

import { Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import TerminalLoader from "@/components/gallery/TerminalLoader";
import PhotoGallery from "@/components/gallery/PhotoGallery";

export default function Home() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<TerminalLoader />}>
        <PhotoGallery />
      </Suspense>
    </ErrorBoundary>
  );
}
