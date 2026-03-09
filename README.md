# EventLens

Instant photo search for any event.

Drop your event photos into Google Drive, let AI analyze them, and give your attendees a fast, searchable gallery. They find their photos by typing what they remember — text on a banner, what someone was wearing, or the kind of scene.

---

## How It Works

EventLens is a template you deploy once per event. The setup has three parts:

1. **Google Drive** — Your event photos live here, organized in folders however you like (by day, session, photographer, etc.)
2. **Apps Script + Gemini AI** — A script reads every photo, uses Gemini to describe what's in it (people, text, scenes), and writes the results to a Google Sheet
3. **This app** — A read-only frontend that searches the Sheet and displays photos with thumbnails pulled directly from Drive

The app never touches your Drive folder. It only reads the Sheet. The Apps Script is the bridge between Drive and the app.

---

## What Attendees Can Do

### Search photos

Type anything into the search bar:

- **Text from the event** — banners, signs, name badges, slide titles, t-shirt logos
- **Descriptions of people** — "red shirt", "glasses", "group of four"
- **Scene types** — "stage", "laptop", "outdoor", "panel discussion"
- **Filenames or folder names** — "DSC_4021", "Day 2"

Search uses AND logic — typing "red shirt laptop" returns photos that match all three terms. Results are ranked by relevance, with text matches weighted highest.

### Browse by folder

If your Drive photos are organized into subfolders, those appear as filter chips below the search bar. Tap a folder to narrow down, tap again to clear. Folder filtering combines with search.

### View full-size photos

Click any thumbnail to open the lightbox:

- Full-resolution image loaded from Drive
- **Metadata panel** showing the AI analysis — detected text, people descriptions, scene description, face count
- **Open in Drive** to see the original file
- **Download** to save a copy
- Navigate with arrow keys, swipe on mobile, or click the side buttons
- Press Escape or click outside to close

### Shareable links

Search state is synced to the URL. Copy the link to share a specific search with someone else — they'll see the same filtered results.

### Live updates

If the Apps Script is still processing photos, the app polls for new data every 30 seconds. A "Photos updating live" indicator appears in the header, and a toast notification lets you refresh when new photos arrive without losing your scroll position.

---

## Setup

### Prerequisites

- A Google Cloud project with the **Sheets API** enabled and an API key
- A Google Drive folder with your event photos
- The EventLens Apps Script (creates and populates the Google Sheet)
- Both the Sheet and Drive folder shared as **"Anyone with the link"**

### 1. Run the Apps Script

Set up the companion Apps Script pointing at your Drive folder. It will:

- Walk through all photos (and subfolders)
- Analyze each one with Gemini AI
- Write the results to a Google Sheet with these columns:

| Filename | Drive URL | Folder | Visible Text | People Descriptions | Scene Description | Face Count | Processed At |

Processing time depends on photo count — roughly 1 hour for 3,000 photos.

### 2. Set environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in the required values:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_SHEETS_API_KEY` | Yes | Your Google Cloud API key with Sheets API enabled |
| `GOOGLE_SHEET_ID` | Yes | The Sheet ID from the URL: `docs.google.com/spreadsheets/d/{THIS}/edit` |
| `NEXT_PUBLIC_EVENT_NAME` | No | Display name shown in the header (default: "Event Photos") |
| `NEXT_PUBLIC_EVENT_TAGLINE` | No | Subtitle below the event name (default: "Find your photos") |
| `NEXT_PUBLIC_PRIMARY_COLOR` | No | Hex color for buttons, links, and active states (default: `#3b82f6`) |
| `NEXT_PUBLIC_ACCENT_COLOR` | No | Hex color for face count badges (default: `#f59e0b`) |

### 3. Deploy

**Local:**

```bash
npm install
npm run build
npm start
```

**Vercel (recommended):**

```bash
vercel
vercel --prod
```

Or use the one-click deploy button and set your env vars in the Vercel dashboard.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_USERNAME%2Feventlens&env=GOOGLE_SHEETS_API_KEY,GOOGLE_SHEET_ID&envDescription=API%20key%20and%20Sheet%20ID%20for%20your%20event%20photos)

---

## Reusing for Another Event

This is a template. Each event gets its own deployment:

1. Create a new Drive folder and add your photos
2. Copy the Apps Script Sheet (File > Make a copy) or create a new one
3. Point the script at the new folder and run it
4. Deploy again with the new `GOOGLE_SHEET_ID` and `NEXT_PUBLIC_EVENT_NAME`

Same app, new data, new URL.

---

## Architecture

```
Google Drive (photos)
       |
       v
Apps Script + Gemini AI (analysis)
       |
       v
Google Sheet (metadata database)
       |
       v
EventLens app (read-only frontend)
       |
       v
Attendees (search + browse + download)
```

- **No database** — the Google Sheet is the only data source
- **No backend** — the app reads the Sheet via the public Sheets API
- **No auth** — everything is public read-only (Sheet and Drive both shared with link)
- **No file uploads** — photos stay in Drive, the app just renders thumbnails and links

The app caches Sheet data for 30 seconds (ISR), so changes from the Apps Script appear within a minute.

---

## License

MIT
