export interface EventLensConfig {
  eventName: string;
  eventTagline: string;
  primaryColor: string;
  accentColor: string;
  sheetId: string;
  geminiApiKey: string;
}

export const config: EventLensConfig = {
  eventName: process.env.NEXT_PUBLIC_EVENT_NAME || "HARD MODE",
  eventTagline:
    process.env.NEXT_PUBLIC_EVENT_TAGLINE || "PHOTO RECONNAISSANCE SYSTEM",
  primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#00ff41",
  accentColor: process.env.NEXT_PUBLIC_ACCENT_COLOR || "#00ff41",
  sheetId: process.env.GOOGLE_SHEET_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
};
