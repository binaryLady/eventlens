// @TheTechMargin 2026
export interface EventLensConfig {
  eventName: string;
  eventYear: string;
  eventTagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  geminiApiKey: string;
  googleApiKey: string;
  driveFolderId: string;
  adminSecret: string;
  // Service Account credentials (for private folders)
  googleClientEmail: string;
  googlePrivateKey: string;
}

export const config: EventLensConfig = {
  eventName: process.env.NEXT_PUBLIC_EVENT_NAME || "HARD MODE",
  eventYear: process.env.NEXT_PUBLIC_EVENT_YEAR || "2026",
  eventTagline:
    process.env.NEXT_PUBLIC_EVENT_TAGLINE || "PHOTO RECONNAISSANCE SYSTEM",
  primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#00ff41",
  secondaryColor: process.env.NEXT_PUBLIC_SECONDARY_COLOR || "#ff00ff",
  accentColor: process.env.NEXT_PUBLIC_ACCENT_COLOR || "#00ff41",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || "",
  adminSecret: process.env.ADMIN_API_SECRET || "",
  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL || "",
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY || "",
};
