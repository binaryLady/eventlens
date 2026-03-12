# Feature: Collage from Selected Photos

## Context

EventLens has a batch selection system: users long-press or click to select photos, which activates a `FloatingActionBar` at the bottom of the screen showing the selection count and a "DOWNLOAD ZIP" button. The selection state is managed in `page.tsx` as `selectedIds: Set<string>`. The existing ZIP download flow sends selected file IDs to `POST /api/download-zip`, which fetches images from Google Drive, bundles them with JSZip, and streams back a ZIP file.

The retro terminal UI uses CSS variables: `--el-green`, `--el-magenta`, `--el-amber`, `--el-bg`, with mono fonts and uppercase labels.

## Goal

Add a "MAKE COLLAGE" button to the FloatingActionBar. When clicked, the server fetches the selected images, composites them into a single collage image (grid layout), and returns it as a downloadable JPEG/PNG. Optionally, use Gemini Flash to pick the best "hero" image (placed larger) when >4 photos are selected.

## Technical Approach

- **Server-side compositing** using Sharp (already a common Next.js dependency, works on Vercel serverless). Sharp can resize, crop, and composite images onto a canvas with no native binary issues on Vercel.
- **Grid layout algorithm**: Simple responsive grid. For N images: 1→full, 2→side-by-side, 3→1 top + 2 bottom, 4→2×2, 5-6→hero + grid, 7+→3-column grid. All images center-cropped to fill their grid cell.
- **Optional Gemini "hero pick"**: If >4 images selected, send thumbnails to Gemini Flash asking "which image is the most visually striking / best represents the group?" — one API call, returns an index. That image gets 2× cell size. Skip this for MVP if you want zero API cost.

## Commit Plan (molecular commits)

### Commit 1: Collage generation API endpoint

**Files:**
- `src/app/api/collage/route.ts`

**Changes:**
- `POST /api/collage` — accepts `{ files: Array<{ fileId: string; filename?: string }>, width?: number, format?: "jpeg" | "png" }`.
- Limit: 20 images max per collage (keeps it fast and within Vercel's 60s function limit).
- Fetches each image from Google Drive (same pattern as `download-zip/route.ts` — use the Google API key URL with `alt=media`).
- Uses **Sharp** to:
  1. Resize each image to fit its grid cell (center-crop with `sharp.resize({ fit: 'cover' })`).
  2. Create a canvas (`sharp.create()`) at the target width (default 2400px) with calculated height.
  3. Composite all cell images onto the canvas using `sharp.composite([...])`.
  4. Output as JPEG (quality 90) or PNG.
- Returns the collage as a binary response with `Content-Type: image/jpeg` and `Content-Disposition: attachment; filename="eventlens-collage.jpg"`.
- Grid layout logic (pure function, easy to test):

```typescript
function calculateGrid(count: number, canvasWidth: number): { cols: number; rows: number; cellWidth: number; cellHeight: number; positions: Array<{ x: number; y: number; w: number; h: number }> } {
  // 1: 1×1 full bleed
  // 2: 2×1
  // 3: 1 top full-width + 2 bottom
  // 4: 2×2
  // 5-6: 3×2
  // 7-9: 3×3
  // 10-12: 4×3
  // 13-16: 4×4
  // 17-20: 5×4
  // Gap: 4px between cells (retro grid look)
}
```

- Add `sharp` to `dependencies` in `package.json`.

**Commit message:** `feat(api): collage generation endpoint with Sharp grid compositing`

---

### Commit 2: Add MAKE COLLAGE button to FloatingActionBar

**Files:**
- `src/components/FloatingActionBar.tsx`

**Changes:**
- Add a new prop `onMakeCollage: () => void` and `collagePending: boolean`.
- Render a "COLLAGE" button next to the existing "DOWNLOAD ZIP" button. Same styling: `border border-[var(--el-green-99)] bg-[var(--el-green-11)]`, mono uppercase.
- Show a spinner when `collagePending` is true (reuse the existing crosshair-spin animation).
- Disable the button when `selectedCount > 20` and show a tooltip/title "Max 20 photos".
- Button label: `COLLAGE` (or `MAKING...` when pending).

**Commit message:** `feat(ui): add COLLAGE button to FloatingActionBar`

---

### Commit 3: Wire collage action in main page

**Files:**
- `src/app/page.tsx`

**Changes:**
- Add `collagePending` state (boolean).
- Implement `handleMakeCollage` function:
  1. Set `collagePending = true`.
  2. Build the `files` array from `selectedIds` (same as existing ZIP logic — map selected IDs to `{ fileId: photo.driveFileId, filename: photo.filename }`).
  3. `fetch('/api/collage', { method: 'POST', body: JSON.stringify({ files }) })`.
  4. On success: convert response to blob, create an object URL, trigger download via a temporary `<a>` element (same pattern as ZIP download).
  5. On error: show a Toast with the error message.
  6. Set `collagePending = false`.
- Pass `onMakeCollage={handleMakeCollage}` and `collagePending` to `FloatingActionBar`.

**Commit message:** `feat: wire collage generation from photo selection`

---

### Commit 4: Collage preview in Lightbox before download

**Files:**
- `src/components/CollagePreview.tsx` (new)
- `src/app/page.tsx`

**Changes:**
- Instead of immediately downloading, show a modal/lightbox preview of the generated collage.
- `CollagePreview` component:
  - Receives the collage blob URL.
  - Displays the collage image at full width in a centered modal overlay.
  - Two buttons: "DOWNLOAD" (triggers the download) and "CANCEL" (dismisses).
  - Styled in the retro terminal theme.
- Update `handleMakeCollage` to set a `collagePreviewUrl` state instead of auto-downloading.
- When the user clicks DOWNLOAD in the preview, trigger the `<a>` download.
- When dismissed, revoke the object URL.

**Commit message:** `feat(ui): collage preview modal before download`

---

### Commit 5: (Optional) Gemini hero image selection

**Files:**
- `src/app/api/collage/route.ts`
- `src/lib/gemini.ts`

**Changes:**
- When >4 images are provided, send their thumbnails (resized to 256px wide) to Gemini Flash with:

```
You are selecting the best "hero" image for a photo collage from an event.
Pick the ONE image that is most visually striking, best composed, and most representative of the event energy.
Respond with ONLY the 1-based index number of that image, nothing else.
```

- The hero image gets a 2× grid cell (spans 2 columns and 2 rows in the top-left).
- Add `pickHeroImage()` to `gemini.ts` — takes array of base64 thumbnails, returns index.
- Make this opt-in via a request body flag `{ hero: true }` so the collage works without any API calls by default.
- In the UI, add a toggle or just enable hero mode automatically when >4 photos are selected.

**Commit message:** `feat: Gemini hero image selection for collages with 5+ photos`

---

## Notes

- Sharp on Vercel serverless: works out of the box (Next.js bundles it correctly). No Docker needed.
- 20-image collage at 2400px wide takes ~2-3 seconds to composite — well within the 60s Vercel limit.
- The grid layout function should be a pure utility — makes it trivial to unit test.
- For v2: add padding/border options, event title overlay, watermark, and aspect ratio presets (square for Instagram, 16:9 for stories).
- The collage is generated server-side (not client-side canvas) because the source images are on Google Drive and CORS prevents direct client-side fetching.
