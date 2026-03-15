// @TheTechMargin 2026
"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { PhotoRecord } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

// Hooks
import { usePhotos } from "@/hooks/usePhotos";
import { useSearch } from "@/hooks/useSearch";
import { useFilters } from "@/hooks/useFilters";
import { useSelection } from "@/hooks/useSelection";
import { useCollage } from "@/hooks/useCollage";
import { useStats } from "@/hooks/useStats";
import { useProgressiveRender } from "@/hooks/useProgressiveRender";
import { useUrlSync } from "@/hooks/useUrlSync";

// Components
import GalleryHeader from "./GalleryHeader";
import FolderTabs from "./FolderTabs";
import TagTabs from "./TagTabs";
import FilterSortBar from "./FilterSortBar";
import FilterSortSheet from "./FilterSortSheet";
import AlbumGrid from "./AlbumGrid";
import HeroSection from "./HeroSection";
import SearchStatus from "./SearchStatus";
import EmptyState from "./EmptyState";
import RecommendationsBar from "./RecommendationsBar";
import PhotoGrid from "./PhotoGrid";
import GridSkeleton from "./GridSkeleton";
import Lightbox from "@/components/Lightbox";
import Toast from "@/components/Toast";
import CollagePreview from "@/components/CollagePreview";
import CollageRatioModal from "@/components/CollageRatioModal";
import FloatingActionBar from "@/components/FloatingActionBar";

export default function PhotoGallery() {
  const searchParams = useSearchParams();

  // Core data
  const photos = usePhotos();
  const search = useSearch(
    searchParams.get("q") || "",
    "", // activeFolder will be set after filters init
  );
  const filters = useFilters(
    photos.allPhotos,
    photos.shuffledPhotos,
    search.debouncedQuery,
    search.serverResults,
    search.matchResults,
  );
  const selection = useSelection();
  const collage = useCollage(
    selection.selectedIds,
    filters.filteredPhotos,
    selection.clearSelection,
    photos.setToast,
  );
  const stats = useStats();

  const resetKey = `${filters.activeFolder}|${filters.activeTag}|${search.debouncedQuery}|${filters.sortOrder}`;
  const { visibleCount, sentinelRef } = useProgressiveRender(
    filters.filteredPhotos.length,
    40,
    resetKey,
  );

  // Lightbox state
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(() => {
    const photoParam = searchParams.get("photo");
    if (photoParam && photos.allPhotos.length > 0) {
      return photos.allPhotos.find((p) => p.filename === photoParam) || null;
    }
    return null;
  });

  // URL sync
  useUrlSync({
    search: search.debouncedQuery,
    folder: filters.activeFolder,
    selectedPhoto,
  });

  // Derived state
  const visiblePhotos = filters.filteredPhotos.slice(0, visibleCount);
  const isHome = !filters.isSearchActive;

  const heroPhotos = useMemo(() => {
    if (filters.sortOrder === "shuffle") return photos.shuffledPhotos.slice(0, 8);
    const sorted = [...photos.allPhotos];
    if (filters.sortOrder === "name-asc") sorted.sort((a, b) => a.filename.localeCompare(b.filename));
    else if (filters.sortOrder === "name-desc") sorted.sort((a, b) => b.filename.localeCompare(a.filename));
    return sorted.slice(0, 8);
  }, [photos.shuffledPhotos, photos.allPhotos, filters.sortOrder]);

  // Handlers
  const handlePhotoClick = useCallback((photo: PhotoRecord) => {
    setSelectedPhoto(photo);
  }, []);

  const handleMatchResultsWithFilterReset = useCallback(
    (data: Parameters<typeof search.handleMatchResults>[0]) => {
      search.handleMatchResults(data);
      filters.setActiveFolder("");
      filters.setActiveTag(null);
    },
    [search, filters],
  );

  const handleClearMatchWithFilterReset = useCallback(() => {
    search.handleClearMatch();
    filters.setActiveType("all");
  }, [search, filters]);

  // Override search's handleMatchResults to also reset filters
  const searchWithFilterReset = useMemo(() => ({
    ...search,
    handleMatchResults: handleMatchResultsWithFilterReset,
    handleClearMatch: handleClearMatchWithFilterReset,
  }), [search, handleMatchResultsWithFilterReset, handleClearMatchWithFilterReset]);

  return (
    <div className="min-h-screen bg-[var(--el-bg)] grid-bg">
      <GalleryHeader
        search={searchWithFilterReset}
        onRefresh={photos.refresh}
        lastUpdated={photos.lastUpdated}
        totalPhotos={photos.allPhotos.length}
        activeFolder={filters.activeFolder}
        activeTag={filters.activeTag}
        activeType={filters.activeType}
        onClearActiveFolder={() => filters.setActiveFolder("")}
        onClearActiveTag={() => filters.setActiveTag(null)}
      />

      {!photos.loading && !photos.error && photos.allPhotos.length > 0 && (
        <div className="mx-auto max-w-5xl px-3 md:px-4 pb-2 md:pb-4 space-y-1.5 md:space-y-2">
          <FolderTabs
            folders={photos.folders}
            active={filters.activeFolder}
            onSelect={filters.setActiveFolder}
            totalCount={photos.allPhotos.length}
            folderCounts={filters.folderCounts}
          />
          <TagTabs
            tags={photos.tags}
            active={filters.activeTag}
            onSelect={filters.setActiveTag}
            tagCounts={filters.tagCounts}
          />
          <div className="flex items-center justify-between gap-2">
            <FilterSortBar filters={filters}>
              <FilterSortSheet
                sortOrder={filters.sortOrder}
                onSortChange={filters.setSortOrder}
                activeType={filters.activeType}
                onTypeChange={filters.setActiveType}
                minFaces={filters.minFaces}
                onMinFacesChange={filters.setMinFaces}
                folders={photos.folders}
                folderCounts={filters.folderCounts}
                activeFolder={filters.activeFolder}
                onFolderChange={filters.setActiveFolder}
                totalCount={photos.allPhotos.length}
              />
            </FilterSortBar>
            <button
              onClick={selection.toggleSelectMode}
              className={`shrink-0 px-2.5 py-1.5 text-[10px] md:text-xs font-mono uppercase tracking-wider transition-all ${
                selection.selectMode
                  ? "border border-[var(--el-accent)] text-[var(--el-accent)] bg-[var(--el-accent-28)] glow-border-accent"
                  : "border border-[var(--el-primary-99)] text-[var(--el-primary-99)] hover:border-[var(--el-accent)] hover:text-[var(--el-accent)]"
              }`}
            >
              {selection.selectMode ? "EXIT" : "SELECT"}
            </button>
          </div>
        </div>
      )}

      {filters.isSearchActive && (search.debouncedQuery || search.matchResults !== null) && !photos.loading && !photos.error && (
        <SearchStatus
          debouncedQuery={search.debouncedQuery}
          matchResults={search.matchResults}
          matchDescription={search.matchDescription}
          filteredCount={filters.filteredPhotos.length}
          totalCount={photos.allPhotos.length}
        />
      )}

      <main className="mx-auto max-w-5xl px-3 pb-16 md:px-4 md:pb-12">
        {photos.loading && <GridSkeleton />}

        {photos.error && (
          <EmptyState type="error" onRetry={photos.retryLoad} />
        )}

        {!photos.loading && !photos.error && photos.allPhotos.length === 0 && (
          <EmptyState type="no-assets" />
        )}

        {!photos.loading && !photos.error && photos.allPhotos.length > 0 && isHome && (
          <>
            <AlbumGrid
              folders={photos.folders}
              photos={photos.shuffledPhotos}
              folderCounts={filters.folderCounts}
              onSelect={filters.setActiveFolder}
            />
            <HeroSection
              photos={heroPhotos}
              totalCount={photos.allPhotos.length}
              sortOrder={filters.sortOrder}
              selectMode={selection.selectMode}
              selectedIds={selection.selectedIds}
              hotPhotoIds={stats.hotPhotoIds}
              onPhotoClick={handlePhotoClick}
              onToggleSelect={selection.togglePhoto}
              onBrowseAll={() => filters.setBrowseAll(true)}
            />
          </>
        )}

        {!photos.loading && !photos.error && filters.isSearchActive && (
          <>
            {filters.filteredPhotos.length === 0 && search.matchResults === null && (
              <EmptyState type="no-results" query={search.debouncedQuery} />
            )}

            {search.matchResults !== null && search.matchResults.length === 0 && (
              <EmptyState type="no-match" />
            )}

            {filters.filteredPhotos.length > 0 && (
              <>
                <PhotoGrid
                  photos={visiblePhotos}
                  selectMode={selection.selectMode}
                  selectedIds={selection.selectedIds}
                  matchInfoMap={filters.matchInfoMap}
                  hotPhotoIds={stats.hotPhotoIds}
                  onPhotoClick={handlePhotoClick}
                  onToggleSelect={selection.togglePhoto}
                />
                {visibleCount < filters.filteredPhotos.length && (
                  <div ref={sentinelRef} className="h-8 w-full" />
                )}
              </>
            )}

            {search.matchResults !== null && search.recommendations.length > 0 && (
              <RecommendationsBar
                recommendations={search.recommendations}
                allPhotos={photos.allPhotos}
                onPhotoClick={handlePhotoClick}
              />
            )}
          </>
        )}
      </main>

      {!photos.loading && !photos.error && photos.allPhotos.length > 0 && (
        <footer className="border-t border-[var(--el-primary-22)] px-4 py-6 text-center">
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-d9)]">
            <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
            <span>
              {photos.allPhotos.length} PHOTOS {"//"} {photos.folders.length} FOLDER{photos.folders.length !== 1 ? "S" : ""}
              {photos.lastUpdated && <> {"//"} UPDATED {timeAgo(photos.lastUpdated).toUpperCase()}</>}
            </span>
            <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
          </div>
        </footer>
      )}

      <Lightbox
        photo={selectedPhoto}
        photos={filters.filteredPhotos}
        onClose={() => setSelectedPhoto(null)}
        onNavigate={setSelectedPhoto}
        isSelected={selectedPhoto ? selection.selectedIds.has(selectedPhoto.id) : false}
        onToggleSelect={(id: string) => {
          if (!selection.selectMode) selection.setSelectMode(true);
          selection.togglePhoto(id);
        }}
      />

      {photos.toast && (
        <Toast
          message={photos.toast.message}
          action={{ label: "SYNC", onClick: photos.refresh }}
          onDismiss={() => photos.setToast(null)}
        />
      )}

      {collage.showRatioModal && (
        <CollageRatioModal
          onSelect={collage.handleRatioSelect}
          onDismiss={() => collage.handleCollageDismiss()}
          selectedCount={selection.selectedIds.size}
        />
      )}

      {collage.collagePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-2 border-[var(--el-primary)] animate-crosshair-spin" />
            </div>
            <span className="text-xs font-mono uppercase tracking-widest text-[var(--el-primary)]">
              GENERATING COLLAGE...
            </span>
          </div>
        </div>
      )}

      {collage.collagePreviewUrl && (
        <CollagePreview
          blobUrl={collage.collagePreviewUrl}
          onDownload={collage.handleCollageDownload}
          onDismiss={collage.handleCollageDismiss}
        />
      )}

      <FloatingActionBar
        selectedCount={selection.selectedIds.size}
        totalCount={filters.filteredPhotos.length}
        onSelectAll={() => selection.selectAll(filters.filteredPhotos)}
        onClearSelection={selection.clearSelection}
        onDownloadZip={collage.handleDownloadZip}
        onMakeCollage={collage.startCollage}
        downloading={collage.downloading}
        collagePending={collage.collagePending}
      />
    </div>
  );
}
