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
  mimeType: string;
  processedAt: string;
  thumbnailUrl: string;
  downloadUrl: string;
  autoTag: string | null;
  ownerName: string;
  cameraInfo: string;
}

export interface PhotosResponse {
  photos: PhotoRecord[];
  folders: string[];
  tags: string[];
  lastUpdated: string;
  total?: number;
  hasMore?: boolean;
}

export type MatchTier = "text" | "visual" | "vector" | "both";

export interface MatchResult {
  photo: PhotoRecord;
  confidence: number; // 0-100
  reason: string;
  tier: MatchTier;
}

export interface MatchResponse {
  matches: MatchResult[];
  description: string;
  tier: "text" | "visual" | "both";
  recommendations?: string[];
}

export interface MatchActivity {
  id: string;
  created_at: string;
  tier: string;
  match_count: number;
  top_confidence: number | null;
}

export interface HotPhoto {
  photo_id: string;
  match_hit_count: number;
}

export interface StatsResponse {
  recentActivity: MatchActivity[];
  hotPhotoIds: HotPhoto[];
  operativesCount: number;
  totalSessions: number;
}
