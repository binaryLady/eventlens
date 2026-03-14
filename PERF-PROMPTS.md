# EventLens Photo Grid Performance Prompts

Four targeted prompts to fix the rendering bottleneck in `src/app/page.tsx` where `filteredPhotos.map()` mounts every photo into the DOM simultaneously.

---

## Prompt 1: Lazy-load non-priority images

**File:** `src/app/page.tsx`, PhotoCard component (~line 1452)

```
In src/app/page.tsx, find the PhotoCard component's <Image> element (around line 1452). It currently looks like this:

<Image
  src={photo.thumbnailUrl}
  alt={photo.filename}
  fill
  unoptimized
  {...(index < 8 ? { priority: true } : {})}
  className={`object-cover transition-opacity duration-300 ${
    !imgLoaded ? "opacity-0" : selected ? "opacity-70" : "opacity-100"
  }`}
  onLoad={() => setImgLoaded(true)}
  onError={() => setImgError(true)}
/>

Add `loading={index < 8 ? "eager" : "lazy"}` so the browser defers fetching off-screen images. The result should be:

<Image
  src={photo.thumbnailUrl}
  alt={photo.filename}
  fill
  unoptimized
  loading={index < 8 ? "eager" : "lazy"}
  {...(index < 8 ? { priority: true } : {})}
  className={`object-cover transition-opacity duration-300 ${
    !imgLoaded ? "opacity-0" : selected ? "opacity-70" : "opacity-100"
  }`}
  onLoad={() => setImgLoaded(true)}
  onError={() => setImgError(true)}
/>

Do not change anything else in PhotoCard. This is a one-line addition.
```

---

## Prompt 2: Progressive rendering via IntersectionObserver

**File:** `src/app/page.tsx`, main gallery component

```
In src/app/page.tsx, implement progressive rendering so the photo grid doesn't mount all photos at once. Currently at line ~1054-1074 there's:

{filteredPhotos.length > 0 && (
  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
    {filteredPhotos.map((photo, index) => (
      <PhotoCard ... />
    ))}
  </div>
)}

Make these changes:

1. Add state and ref at the top of the component (the function that contains these renders already imports useState, useRef, useEffect from React):

const BATCH_SIZE = 40;
const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
const sentinelRef = useRef<HTMLDivElement>(null);

2. Add an IntersectionObserver effect. Place it with the other useEffect hooks:

useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        setVisibleCount(prev => Math.min(prev + BATCH_SIZE, filteredPhotos.length));
      }
    },
    { rootMargin: '400px' }
  );
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [filteredPhotos.length]);

3. Reset visibleCount when the filtered set changes (so switching folders or search doesn't show stale counts):

useEffect(() => {
  setVisibleCount(BATCH_SIZE);
}, [activeFolder, activeTag, debouncedQuery, sortOrder]);

4. Replace the grid render block with:

{filteredPhotos.length > 0 && (
  <>
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
      {filteredPhotos.slice(0, visibleCount).map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          onClick={() => {
            if (selectMode) {
              togglePhotoSelection(photo.id);
            } else {
              setSelectedPhoto(photo);
            }
          }}
          matchInfo={matchInfoMap?.get(photo.id)}
          index={index}
          selectMode={selectMode}
          selected={selectedIds.has(photo.id)}
          isHot={hotPhotoIds.has(photo.driveFileId)}
        />
      ))}
    </div>
    {visibleCount < filteredPhotos.length && (
      <div ref={sentinelRef} className="h-8 w-full" />
    )}
  </>
)}

This renders 40 photos initially and loads 40 more as the user scrolls within 400px of the bottom. Keep the existing filteredPhotos computation untouched — only the .map() call changes to use .slice(0, visibleCount).
```

---

## Prompt 3: Cap stagger animation to first batch

**File:** `src/app/page.tsx`, PhotoCard component (~line 1434-1441)

```
In src/app/page.tsx, the PhotoCard component applies a stagger animation to every card via:

className={`... animate-grid-reveal ...`}
style={{ '--delay': `${index * 0.03}s` } as React.CSSProperties}

With 2,000 photos this creates 2,000 concurrent CSS animations. The compositor chokes.

Make two changes in the PhotoCard component:

1. Only apply the animate-grid-reveal class to the first batch (indices 0-39). Change the className on the outer <button> from:

className={`group relative aspect-[4/3] overflow-hidden border bg-[var(--el-bg)] cursor-pointer transition-all duration-200 motion-safe:hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,0,255,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] animate-grid-reveal ${

to:

className={`group relative aspect-[4/3] overflow-hidden border bg-[var(--el-bg)] cursor-pointer transition-all duration-200 motion-safe:hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,0,255,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] ${index < 40 ? 'animate-grid-reveal' : ''} ${

2. Change the style prop from:

style={{ '--delay': `${index * 0.03}s` } as React.CSSProperties}

to:

style={index < 40 ? { '--delay': `${index * 0.03}s` } as React.CSSProperties : undefined}

Cards loaded via infinite scroll (index >= 40) will appear immediately without animation. This is actually better UX — users expect instant appearance when scrolling, not a staggered reveal.
```

---

## Prompt 4: Paginate the API data fetch

**Files:** `src/app/api/photos/route.ts` and `src/lib/photos.ts`

```
The photos API endpoint at src/app/api/photos/route.ts returns all photos in one response. The fetchSupabaseMetadata() function in src/lib/photos.ts does `select("*")` with no LIMIT — loading every completed row into memory.

For a customer with 10 subfolders × 500 photos, that's 5,000 entries on every cache miss.

Add cursor-based pagination:

1. In src/app/api/photos/route.ts, accept optional query params for pagination:

import { NextRequest, NextResponse } from "next/server";
import { fetchPhotosWithMetadata, getFolders, getTags } from "@/lib/photos";

export const revalidate = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 200, 1000);
    const offset = Number(searchParams.get("offset")) || 0;

    const allPhotos = await fetchPhotosWithMetadata();
    const folders = getFolders(allPhotos);
    const tags = getTags(allPhotos);
    const total = allPhotos.length;

    const photos = allPhotos.slice(offset, offset + limit);

    const lastUpdated =
      allPhotos.length > 0
        ? allPhotos.reduce((latest, p) => {
            const t = p.processedAt;
            return t > latest ? t : latest;
          }, allPhotos[0].processedAt)
        : "";

    return NextResponse.json({
      photos,
      folders,
      tags,
      lastUpdated,
      total,
      hasMore: offset + limit < total,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }
}

Note: This still fetches all photos server-side for folder/tag extraction (needed for filter UI), but only sends a page of photo data over the wire. The ISR cache at revalidate: 30 means the full fetch only happens every 30 seconds regardless.

2. In src/lib/photos.ts, add a LIMIT to the Supabase query in fetchSupabaseMetadata. Change:

const { data, error } = await supabase
  .from("photos")
  .select("*")
  .eq("status", "completed")
  .neq("hidden", true);

to:

const { data, error } = await supabase
  .from("photos")
  .select("drive_file_id, visible_text, people_descriptions, scene_description, face_count, mime_type, processed_at, auto_tag")
  .eq("status", "completed")
  .neq("hidden", true);

This is a select-column optimization rather than a row LIMIT — we need all rows to merge with Drive data, but selecting specific columns instead of `*` reduces payload size significantly (drops any large columns like raw embeddings or full-res URLs that may exist in the table).

3. On the client side in src/app/page.tsx, update the fetch call to request paginated data and load more as needed. Find the fetchData function and update the API URL to include limit/offset params. The IntersectionObserver from Prompt 2 handles the frontend progressive render — this pagination reduces the initial JSON payload over the wire.

The client should request the first 200 photos initially. Since the IntersectionObserver only shows 40 at a time, 200 gives plenty of buffer. Additional pages can be fetched when visibleCount approaches the loaded count.
```

---

## Implementation Order

1. **Prompt 1** — one-line `loading="lazy"` addition. Ship immediately, zero risk.
2. **Prompt 3** — cap animations. Also very low risk, big compositor savings.
3. **Prompt 2** — progressive rendering. Medium complexity, biggest UX improvement.
4. **Prompt 4** — API pagination. Most involved, best saved for when you have time to test the client-side fetch loop.

Prompts 1-3 are pure frontend changes in a single file. Prompt 4 touches the API layer.
