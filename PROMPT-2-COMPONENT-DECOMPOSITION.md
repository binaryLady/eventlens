# Prompt: Decompose `page.tsx` into Composable Components

## Objective

Break `src/app/page.tsx` (~1600 lines) into focused, testable components and custom hooks. The file currently contains `PhotoGrid` (~1050 lines with ~30 useState hooks), `FilterSortSheet` (~220 lines), `PhotoCard` (~160 lines), plus utility functions and loading states — all inline. Extract these into a clean component tree with shared state via custom hooks.

---

## Current Structure (what exists in `page.tsx`)

### Utility Functions (lines ~27-46)
- `timeAgo(dateString: string): string` — relative time formatting
- `isRecentlyUpdated(dateString: string): boolean` — checks if within 2 minutes

### Components Defined Inline
- **`TerminalLoader`** (lines ~48-126) — Boot sequence animation with typewriter effect
- **`GridSkeleton`** (lines ~128-150) — Placeholder skeleton grid during loading
- **`PhotoGrid`** (lines ~152-1209) — THE MONOLITH. Contains all state, effects, callbacks, and JSX
- **`FilterSortSheet`** (lines ~1213-1431) — Filter/sort dropdown with mobile bottom sheet + desktop popover
- **`PhotoCard`** (lines ~1440-1596) — Individual photo card with image loading, video overlay, selection, badges
- **`Home`** (bottom) — Wrapper with Suspense + ErrorBoundary

### Already-Extracted Components (in `src/components/`)
- `ActivityTicker.tsx`, `ErrorBoundary.tsx`, `Footer.tsx`, `PhotoUpload.tsx`
- `Toast.tsx`, `CollagePreview.tsx`, `CollageRatioModal.tsx`
- `FloatingActionBar.tsx`, `Lightbox.tsx`

---

## Target Architecture

```
src/
├── app/
│   └── page.tsx                    // Thin: <Suspense> → <PhotoGallery />
├── components/
│   ├── gallery/
│   │   ├── PhotoGallery.tsx        // Orchestrator: composes hooks + layout
│   │   ├── GalleryHeader.tsx       // Search bar, title, refresh button, logout
│   │   ├── FolderTabs.tsx          // Horizontal folder pill navigation
│   │   ├── TagTabs.tsx             // Horizontal tag pill navigation
│   │   ├── FilterSortBar.tsx       // Filter/sort trigger + active filter badges
│   │   ├── FilterSortSheet.tsx     // The full filter/sort panel (mobile sheet + desktop popover)
│   │   ├── PhotoGrid.tsx           // Grid rendering: maps photos → PhotoCard with IntersectionObserver
│   │   ├── PhotoCard.tsx           // Single photo card (already ~160 lines, just extract)
│   │   ├── AlbumGrid.tsx           // Folder preview cards for home/browse view
│   │   ├── HeroSection.tsx         // Hero photo carousel/highlight
│   │   ├── SearchStatus.tsx        // "N results for query" / match tier info
│   │   ├── RecommendationsBar.tsx  // AI recommendation pills
│   │   ├── EmptyState.tsx          // Zero-results messaging
│   │   ├── TerminalLoader.tsx      // Boot animation (extract as-is)
│   │   └── GridSkeleton.tsx        // Loading skeleton (extract as-is)
│   ├── ActivityTicker.tsx          // (existing)
│   ├── CollagePreview.tsx          // (existing)
│   ├── CollageRatioModal.tsx       // (existing)
│   ├── ErrorBoundary.tsx           // (existing)
│   ├── FloatingActionBar.tsx       // (existing)
│   ├── Footer.tsx                  // (existing)
│   ├── Lightbox.tsx                // (existing)
│   ├── PhotoUpload.tsx             // (existing)
│   └── Toast.tsx                   // (existing)
├── hooks/
│   ├── usePhotos.ts                // Photo fetching, polling, refresh
│   ├── useSearch.ts                // Search input, debounce, server-side search
│   ├── useFilters.ts               // Folder, tag, type, face count, sort order filtering
│   ├── useSelection.ts             // Multi-select mode, selected IDs, select all
│   ├── useCollage.ts               // Collage creation flow (ratio modal → preview → download)
│   ├── useStats.ts                 // Stats polling (recentActivity, hotPhotoIds, operativesCount)
│   ├── useProgressiveRender.ts     // IntersectionObserver-based progressive DOM rendering
│   └── useUrlSync.ts               // Sync search/filter state with URL query params
└── lib/
    └── utils.ts                    // timeAgo, isRecentlyUpdated, isVideoFile
```

---

## Custom Hooks Specification

### `usePhotos.ts`

Extracts the core data fetching loop from PhotoGrid.

```typescript
interface UsePhotosReturn {
  allPhotos: PhotoRecord[];
  folders: string[];
  tags: string[];
  lastUpdated: string;
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePhotos(): UsePhotosReturn
```

**State to extract from PhotoGrid**:
- `allPhotos`, `folders`, `tags`, `lastUpdated`, `loading`, `error`

**Effects to extract**:
- Initial fetch on mount (`/api/photos`)
- Polling interval (every 30s, calls `/api/photos` and merges)
- The `fetchData` callback

**Key behaviors**:
- On initial load: set `loading: true`, fetch, populate state
- Polling: silently update `allPhotos` without flashing loading state. Only update if data actually changed (compare `lastUpdated` timestamp).
- `refresh()`: Force re-fetch with loading indicator

### `useSearch.ts`

Extracts search input handling, debounce, and server-side search.

```typescript
interface UseSearchReturn {
  searchInput: string;
  setSearchInput: (v: string) => void;
  debouncedQuery: string;
  serverResults: MatchResult[] | null;
  matchDescription: string;
  recommendations: string[];
  isSearching: boolean;
  clearSearch: () => void;
}

export function useSearch(allPhotos: PhotoRecord[]): UseSearchReturn
```

**State to extract**:
- `searchInput`, `debouncedQuery`, `serverResults`, `matchDescription`, `recommendations`

**Effects to extract**:
- Debounce effect: update `debouncedQuery` 300ms after `searchInput` changes
- Server search effect: when `debouncedQuery` is long enough (>2 chars), call `/api/search?q=...` or `/api/match` depending on query nature
- URL sync for search query (or delegate to `useUrlSync`)

**Key behaviors**:
- Short queries (<3 chars) use client-side `searchPhotos()` from `lib/photos`
- Longer queries trigger server-side vector/vision search
- `clearSearch()` resets all search state

### `useFilters.ts`

Extracts all filtering and sorting logic.

```typescript
interface UseFiltersReturn {
  activeFolder: string;
  setActiveFolder: (f: string) => void;
  activeTag: string;
  setActiveTag: (t: string) => void;
  activeType: "all" | "photo" | "video";
  setActiveType: (t: "all" | "photo" | "video") => void;
  minFaces: number;
  setMinFaces: (n: number) => void;
  sortOrder: string;
  setSortOrder: (s: string) => void;
  browseAll: boolean;
  setBrowseAll: (b: boolean) => void;
  filteredPhotos: PhotoRecord[];
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

export function useFilters(
  allPhotos: PhotoRecord[],
  searchResults: PhotoRecord[] | null,
  serverResults: MatchResult[] | null
): UseFiltersReturn
```

**State to extract**:
- `activeFolder`, `activeTag`, `activeType`, `minFaces`, `sortOrder`, `browseAll`

**Logic to extract**:
- `applySorting()` — sort by date (newest/oldest), shuffle, or match confidence
- `applyTypeFilter()` — filter by photo/video mime type
- `filteredPhotos` useMemo chain: start with serverResults or client search results → apply folder filter → apply tag filter → apply type filter → apply face count filter → apply sort
- `isVideoFile()` helper (move to `lib/utils.ts`)
- `clearFilters()` resets all filter state to defaults
- `hasActiveFilters` computed boolean

### `useSelection.ts`

Extracts multi-select functionality.

```typescript
interface UseSelectionReturn {
  selectMode: boolean;
  selectedIds: Set<string>;
  toggleSelectMode: () => void;
  togglePhoto: (id: string) => void;
  selectAll: (photos: PhotoRecord[]) => void;
  clearSelection: () => void;
  selectedCount: number;
}

export function useSelection(): UseSelectionReturn
```

**State to extract**:
- `selectMode`, `selectedIds`

**Callbacks to extract**:
- `toggleSelectMode`, `togglePhotoSelection`, `selectAll`, `clearSelection`

### `useCollage.ts`

Extracts collage creation flow.

```typescript
interface UseCollageReturn {
  collagePending: boolean;
  collagePreviewUrl: string | null;
  showRatioModal: boolean;
  startCollage: () => void;          // opens ratio modal
  handleRatioSelect: (ratio: string) => void;  // triggers collage generation
  handleCollageDownload: () => void;
  handleCollageDismiss: () => void;
}

export function useCollage(selectedIds: Set<string>): UseCollageReturn
```

**State to extract**:
- `collagePending`, `collagePreviewUrl`, `showRatioModal`

### `useStats.ts`

Extracts stats polling for the activity ticker and hot photos.

```typescript
interface UseStatsReturn {
  recentActivity: MatchActivity[];
  hotPhotoIds: HotPhoto[];
  operativesCount: number;
  totalSessions: number;
}

export function useStats(): UseStatsReturn
```

**Effects to extract**:
- Stats polling interval (fetches `/api/stats` every 60s)

### `useProgressiveRender.ts`

Extracts the IntersectionObserver-based progressive rendering.

```typescript
interface UseProgressiveRenderReturn {
  visibleCount: number;
  sentinelRef: React.RefObject<HTMLDivElement>;
}

export function useProgressiveRender(
  totalCount: number,
  batchSize?: number  // default 40
): UseProgressiveRenderReturn
```

**Logic to extract**:
- `visibleCount` state, starts at `batchSize`
- IntersectionObserver watches a sentinel div at the bottom of the visible list
- When sentinel enters viewport, increment `visibleCount` by `batchSize`
- Reset `visibleCount` when `totalCount` changes significantly (new search, filter change)

### `useUrlSync.ts`

Extracts URL query parameter synchronization.

```typescript
export function useUrlSync(params: {
  search?: string;
  folder?: string;
  tag?: string;
}): void
```

**Effects to extract**:
- The effect that reads `?q=`, `?folder=`, `?tag=` from URL on mount
- The effect that pushes state changes back to URL via `window.history.replaceState`

---

## Component Specifications

### `PhotoGallery.tsx` (the new orchestrator)

This replaces the massive `PhotoGrid` component. It composes all hooks and renders the layout:

```typescript
export default function PhotoGallery() {
  const { allPhotos, folders, tags, lastUpdated, loading, error, refresh } = usePhotos();
  const search = useSearch(allPhotos);
  const filters = useFilters(allPhotos, clientSearchResults, search.serverResults);
  const selection = useSelection();
  const collage = useCollage(selection.selectedIds);
  const stats = useStats();
  const { visibleCount, sentinelRef } = useProgressiveRender(filters.filteredPhotos.length);

  // Derived state
  const visiblePhotos = filters.filteredPhotos.slice(0, visibleCount);
  const isHome = !search.debouncedQuery && !filters.activeFolder && !filters.activeTag;

  return (
    <div>
      <GalleryHeader search={search} onRefresh={refresh} lastUpdated={lastUpdated} />
      <FolderTabs folders={folders} active={filters.activeFolder} onSelect={filters.setActiveFolder} />
      <TagTabs tags={tags} active={filters.activeTag} onSelect={filters.setActiveTag} />
      <FilterSortBar filters={filters} photoCount={filters.filteredPhotos.length} />

      {loading ? <GridSkeleton /> : error ? <ErrorState /> : (
        <>
          {isHome && <HeroSection photos={heroPhotos} />}
          {isHome && <AlbumGrid folders={folders} photos={allPhotos} onSelect={filters.setActiveFolder} />}
          {search.debouncedQuery && <SearchStatus ... />}

          <PhotoGrid
            photos={visiblePhotos}
            selection={selection}
            matchInfo={matchInfoMap}
            hotPhotoIds={stats.hotPhotoIds}
            onPhotoClick={openLightbox}
          />
          <div ref={sentinelRef} /> {/* progressive render trigger */}

          {search.recommendations && <RecommendationsBar items={search.recommendations} />}
        </>
      )}

      <Footer />
      {selectedPhoto && <Lightbox ... />}
      {collage.showRatioModal && <CollageRatioModal ... />}
      {collage.collagePreviewUrl && <CollagePreview ... />}
      {selection.selectMode && <FloatingActionBar ... />}
    </div>
  );
}
```

Target: **~150-200 lines** of clean compositional JSX. No business logic, no effects, no complex callbacks — just hook composition and layout.

### `GalleryHeader.tsx`

The top bar with search input, event name, refresh button, last-updated indicator, logout.

Props:
```typescript
interface GalleryHeaderProps {
  search: UseSearchReturn;
  onRefresh: () => void;
  lastUpdated: string;
  eventName?: string;
}
```

~80-100 lines. Includes the search input with clear button, the animated "recently updated" pulse indicator, and action buttons.

### `FolderTabs.tsx`

Horizontal scrollable folder pills. Shows on desktop; hidden on mobile (filters go in FilterSortSheet).

Props:
```typescript
interface FolderTabsProps {
  folders: string[];
  active: string;
  onSelect: (folder: string) => void;
  photoCounts?: Map<string, number>;  // optional count badges
}
```

~50-60 lines. "All" tab + one pill per folder.

### `TagTabs.tsx`

Same pattern as FolderTabs but for auto-generated tags.

~40-50 lines.

### `FilterSortBar.tsx`

The bar that shows active filter count, trigger button for FilterSortSheet, and inline sort toggle.

~40-50 lines.

### `FilterSortSheet.tsx`

Extract the existing ~220-line component as-is, but update it to accept props from `useFilters` instead of reaching into parent state.

Props:
```typescript
interface FilterSortSheetProps {
  filters: UseFiltersReturn;
  folders: string[];
  tags: string[];
  onClose: () => void;
}
```

Keep the existing mobile bottom-sheet / desktop popover dual behavior.

### `PhotoGrid.tsx` (the display grid, NOT the monolith)

Pure rendering component. Maps an array of photos to PhotoCard components in a CSS grid.

Props:
```typescript
interface PhotoGridProps {
  photos: PhotoRecord[];
  selection: UseSelectionReturn;
  matchInfo?: Map<string, MatchResult>;
  hotPhotoIds?: HotPhoto[];
  onPhotoClick: (photo: PhotoRecord) => void;
}
```

~60-80 lines. Just the grid container + map.

### `PhotoCard.tsx`

Extract the existing ~160-line component. It already has a clean interface — just move it to its own file and ensure it accepts all data via props (no reaching into parent context).

Props:
```typescript
interface PhotoCardProps {
  photo: PhotoRecord;
  isSelected: boolean;
  selectMode: boolean;
  onSelect: (id: string) => void;
  onClick: (photo: PhotoRecord) => void;
  matchInfo?: MatchResult;
  isHot?: boolean;
}
```

### `AlbumGrid.tsx`

The folder preview grid shown on the home view. Each card shows a folder name + 4 preview thumbnails.

Props:
```typescript
interface AlbumGridProps {
  folders: string[];
  photos: PhotoRecord[];
  onSelect: (folder: string) => void;
}
```

~60-80 lines. Uses the existing `folderPreviews` useMemo logic (group photos by folder, take first 4).

### `HeroSection.tsx`

The hero/featured photos display at the top of the home view.

~40-60 lines.

### `SearchStatus.tsx`

Shows search result count, match tier indicator, and active query.

~30-40 lines.

### `EmptyState.tsx`

Zero-results message with suggestions.

~20-30 lines.

### `RecommendationsBar.tsx`

Horizontal scrollable recommendation pills that trigger new searches.

~30-40 lines.

---

## Extraction Order (dependency-aware)

Do these in order to avoid breaking the app at any step:

1. **Utilities first**: Move `timeAgo`, `isRecentlyUpdated`, `isVideoFile` to `src/lib/utils.ts`

2. **Simple leaf components**: Extract `TerminalLoader`, `GridSkeleton`, `PhotoCard` — these have no dependencies on parent state beyond props

3. **Custom hooks**: Create hooks one at a time, keeping the old state in PhotoGrid as a fallback:
   - `usePhotos` (most independent)
   - `useStats` (independent)
   - `useSelection` (independent)
   - `useProgressiveRender` (independent)
   - `useSearch` (depends on allPhotos from usePhotos)
   - `useFilters` (depends on allPhotos, search results)
   - `useCollage` (depends on selectedIds from useSelection)
   - `useUrlSync` (depends on search + filter state)

4. **Section components**: Extract `GalleryHeader`, `FolderTabs`, `TagTabs`, `FilterSortBar`, `AlbumGrid`, `HeroSection`, `SearchStatus`, `EmptyState`, `RecommendationsBar`

5. **FilterSortSheet**: Extract and rewire to accept hook-based props

6. **PhotoGrid display component**: Extract the grid rendering

7. **PhotoGallery orchestrator**: Create the new orchestrator that composes everything

8. **Slim down `page.tsx`**: Reduce to just `<Suspense><PhotoGallery /></Suspense>` with ErrorBoundary wrapper

---

## State Management Notes

### No Context Needed (Yet)

The current app passes everything via props/callbacks. With custom hooks, the `PhotoGallery` orchestrator holds all hook state and drills props down. This is fine for a component tree that's only 2-3 levels deep. Don't add React Context or a state library unless prop drilling becomes painful after the refactor.

### Memoization Strategy

- `PhotoCard`: Wrap in `React.memo()` with a custom comparator that checks `photo.id`, `isSelected`, `matchInfo?.confidence`, `isHot`. This prevents re-renders when unrelated state changes.
- `filteredPhotos` in `useFilters`: Already a useMemo — keep it.
- `folderPreviews` / `heroPhotos`: Move to useMemo inside their respective components.
- `matchInfoMap`: Keep as useMemo derived from `serverResults`.

### Event Handler Stability

Use `useCallback` for handlers passed to memoized children:
- `onPhotoClick`, `onSelect` in PhotoGrid → PhotoCard
- `onRefresh` in GalleryHeader
- Filter setters are already stable (from useState)

---

## Testing Approach

- **Hook tests**: Use `@testing-library/react-hooks` (or `renderHook` from `@testing-library/react`) to test each hook in isolation with mocked fetch
- **Component tests**: Render each component with fixture data, verify correct output
- **Integration test**: Render `PhotoGallery` with MSW (Mock Service Worker) intercepting API calls, verify the full flow: loading → data → search → filter → select

---

## Line Count Targets

| File | Target Lines |
|---|---|
| `page.tsx` | ~20 (just Suspense wrapper) |
| `PhotoGallery.tsx` | ~150-200 |
| `GalleryHeader.tsx` | ~80-100 |
| `FolderTabs.tsx` | ~50-60 |
| `TagTabs.tsx` | ~40-50 |
| `FilterSortBar.tsx` | ~40-50 |
| `FilterSortSheet.tsx` | ~220 (same, just extracted) |
| `PhotoGrid.tsx` | ~60-80 |
| `PhotoCard.tsx` | ~160 (same, just extracted) |
| `AlbumGrid.tsx` | ~60-80 |
| `HeroSection.tsx` | ~40-60 |
| `SearchStatus.tsx` | ~30-40 |
| `EmptyState.tsx` | ~20-30 |
| `RecommendationsBar.tsx` | ~30-40 |
| `TerminalLoader.tsx` | ~80 |
| `GridSkeleton.tsx` | ~25 |
| **Hooks (8 files)** | ~50-80 each, ~500 total |
| **Total** | ~1600 (same code, distributed across ~24 files) |

The total line count stays similar — the win is in comprehensibility, testability, and reusability. Each file has a single responsibility and can be understood in isolation.
