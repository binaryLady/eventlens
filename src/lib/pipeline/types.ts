// @TheTechMargin 2026
// Pipeline-specific types for the serverless photo processing pipeline.

export interface PipelinePhoto {
  drive_file_id: string;
  filename: string;
  drive_url: string;
  folder: string;
  mime_type: string;
  status: "pending" | "processing" | "completed" | "error";
  error_message?: string | null;
  visible_text?: string;
  people_descriptions?: string;
  scene_description?: string;
  face_count?: number;
  auto_tag?: string | null;
  processed_at?: string | null;
  description_embedding?: number[] | null;
  phash?: number | null;
  hidden?: boolean;
}

export interface GeminiAnalysis {
  visible_text: string;
  people_descriptions: string;
  scene_description: string;
  face_count: number;
}

export interface FaceEmbeddingData {
  embedding: number[];
  bbox: number[];
  index: number;
}

export interface FaceEmbeddingRow {
  drive_file_id: string;
  filename: string;
  folder: string;
  face_index: number;
  embedding: number[] | null;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
}

export interface DriveEntry {
  id: string;
  name: string;
  folder: string;
}

export interface PhaseResult {
  phase: string;
  processed: number;
  remaining: number;
  done: boolean;
  errors: string[];
}
