// @TheTechMargin 2026
export interface PhotoRecord {
  id: string;
  filename: string;
  driveUrl: string;
  driveFileId: string;
  folder: string;
  visibleText: string;
  peopleDescriptions: string;
  sceneDescription: string;
  faceCount: number;
  processedAt: string;
  thumbnailUrl: string;
  downloadUrl: string;
}

export interface PhotosResponse {
  photos: PhotoRecord[];
  folders: string[];
  lastUpdated: string;
}

export interface MatchResult {
  photo: PhotoRecord;
  confidence: number; // 0-100
  reason: string;
}

export interface MatchResponse {
  matches: MatchResult[];
  description: string; // AI-generated description of the uploaded person
  tier: "text" | "visual" | "both";
}
