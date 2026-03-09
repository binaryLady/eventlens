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
