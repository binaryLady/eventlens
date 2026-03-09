# EventLens — Instant Photo Search for Any Event

A reusable Next.js app that turns any Google Drive photo folder into a searchable gallery. An event organizer drops photos in Drive, runs an Apps Script to analyze them with Gemini AI, and deploys this app pointing at the resulting Google Sheet. Attendees search by text on banners, descriptions of people, scene types, or folder names.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_USERNAME%2Feventlens&env=GOOGLE_SHEETS_API_KEY,GOOGLE_SHEET_ID&envDescription=API%20key%20and%20Sheet%20ID%20for%20your%20event%20photos)

---

## Setup (3 steps)

### 1. Prepare your Google Sheet

Run the [EventLens Apps Script](#apps-script) on a Google Drive folder of event photos. It creates a Sheet with columns:

| Filename | Drive URL | Folder | Visible Text | People Descriptions | Scene Description | Face Count | Processed At |

Share both the Sheet and Drive folder as **"Anyone with the link → Viewer"**.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

| Variable                    | Required | Description                                                             |
| --------------------------- | -------- | ----------------------------------------------------------------------- |
| `GOOGLE_SHEETS_API_KEY`     | Yes      | Google Cloud API key with Sheets API enabled                            |
| `GOOGLE_SHEET_ID`           | Yes      | The Sheet ID from the URL: `docs.google.com/spreadsheets/d/{THIS}/edit` |
| `NEXT_PUBLIC_EVENT_NAME`    | No       | Display name (default: "Event Photos")                                  |
| `NEXT_PUBLIC_EVENT_TAGLINE` | No       | Subtitle text (default: "Find your photos")                             |
| `NEXT_PUBLIC_PRIMARY_COLOR` | No       | Hex color for accents (default: `#3b82f6`)                              |
| `NEXT_PUBLIC_ACCENT_COLOR`  | No       | Hex color for badges (default: `#f59e0b`)                               |

### 3. Deploy

```bash
npm install
npm run build
npm start
```

Or deploy to Vercel:

```bash
vercel
vercel --prod
```

---

## Features

- **Text search** — find photos by text on banners, signs, name badges
- **AI descriptions** — search by scene content ("laptop", "presenting", "red shirt")
- **Folder filtering** — browse by event day or session
- **Photo lightbox** — full-size view with metadata and download
- **Auto-refresh** — detects new photos as they're processed
- **Shareable URLs** — search state synced to URL params
- **Mobile responsive** — swipe navigation in lightbox, scrollable filters

## For the next event

1. Create a new Drive folder, drop photos
2. Copy the Apps Script Sheet (File → Make a copy)
3. Update `FOLDER_ID` in the script and run it
4. Deploy with new env vars (`GOOGLE_SHEET_ID`, `NEXT_PUBLIC_EVENT_NAME`)
5. Done — new URL, new event, same tool

## Apps Script

<!-- TODO: Add link to the EventLens Apps Script repository -->

The Apps Script analyzes photos with Gemini AI and populates the Google Sheet. See the companion repository for setup instructions.

## License

MIT
