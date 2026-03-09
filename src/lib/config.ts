export interface EventLensConfig {
  eventName: string;
  eventTagline: string;
  primaryColor: string;
  accentColor: string;
  sheetId: string;
  geminiApiKey: string;
}

export const config: EventLensConfig = {
  eventName: process.env.NEXT_PUBLIC_EVENT_NAME || "Event Photos",
  eventTagline: process.env.NEXT_PUBLIC_EVENT_TAGLINE || "Find your photos",
  primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#3b82f6",
  accentColor: process.env.NEXT_PUBLIC_ACCENT_COLOR || "#f59e0b",
  sheetId: process.env.GOOGLE_SHEET_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
};
