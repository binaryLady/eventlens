// @TheTechMargin 2026
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PhotoRecord } from "@/lib/types";

export function useUrlSync(params: {
  search?: string;
  folder?: string;
  selectedPhoto?: PhotoRecord | null;
}): void {
  const router = useRouter();

  useEffect(() => {
    const urlParams = new URLSearchParams();
    if (params.search) urlParams.set("q", params.search);
    if (params.folder) urlParams.set("folder", params.folder);
    if (params.selectedPhoto) urlParams.set("photo", params.selectedPhoto.filename);
    const str = urlParams.toString();
    router.replace(str ? `?${str}` : "/", { scroll: false });
  }, [params.search, params.folder, params.selectedPhoto, router]);
}
