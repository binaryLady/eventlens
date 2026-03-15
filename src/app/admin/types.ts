// @TheTechMargin 2026
// Admin dashboard type definitions — shared across hooks and components.

export interface StatusData {
  total: number;
  completed: number;
  pending: number;
  processing: number;
  errors: number;
  withEmbeddings: number;
  faceEmbeddings: number;
  lastProcessed: string | null;
  recentErrors: Array<{ filename: string; error: string }>;
  folders: Array<{ name: string; count: number }>;
}

export interface ActionResult {
  message?: string;
  error?: string;
  output?: string;
  stderr?: string;
  hint?: string;
  phase?: string;
  processed?: number;
  remaining?: number;
  done?: boolean;
  errors?: string[];
  [key: string]: unknown;
}

export interface DuplicatePhoto {
  id: string;
  driveFileId: string;
  filename: string;
  folder: string;
  phash: number;
  hammingDistance: number;
  hidden: boolean;
  thumbnailUrl: string;
}

export interface DuplicateCluster {
  groupId: number;
  photos: DuplicatePhoto[];
}

export interface DuplicateData {
  clusters: DuplicateCluster[];
  totalClusters: number;
  totalDuplicates: number;
  threshold: number;
}
