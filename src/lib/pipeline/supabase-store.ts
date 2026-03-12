// @TheTechMargin 2026
// Supabase CRUD operations for the pipeline.
// Builds on the existing createServerClient from src/lib/supabase.ts.

import { createServerClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelinePhoto, FaceEmbeddingRow } from "./types";

export class SupabaseStore {
  private client: SupabaseClient;

  constructor() {
    this.client = createServerClient();
  }

  // ── Pagination helper ──

  private async paginate<T>(
    queryFn: (offset: number, limit: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  ): Promise<T[]> {
    const rows: T[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await queryFn(offset, pageSize);
      if (error) throw new Error(`Supabase query error: ${JSON.stringify(error)}`);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return rows;
  }

  // ── Photo lifecycle ──

  async upsertPhoto(photo: {
    drive_file_id: string;
    filename: string;
    drive_url: string;
    folder: string;
    mime_type: string;
    status: string;
  }): Promise<void> {
    // Insert-or-skip, then update mutable metadata
    await this.client
      .from("photos")
      .upsert(photo, { onConflict: "drive_file_id", ignoreDuplicates: true })
      .throwOnError();

    await this.client
      .from("photos")
      .update({
        filename: photo.filename,
        folder: photo.folder,
        drive_url: photo.drive_url,
        mime_type: photo.mime_type,
      })
      .eq("drive_file_id", photo.drive_file_id)
      .throwOnError();
  }

  async reconnectPhoto(
    oldFileId: string,
    newFileId: string,
    filename: string,
    folder: string,
  ): Promise<void> {
    const driveUrl = `https://drive.google.com/file/d/${newFileId}/view`;
    const meta = { drive_file_id: newFileId, filename, folder };

    await this.client
      .from("face_embeddings")
      .update(meta)
      .eq("drive_file_id", oldFileId)
      .throwOnError();

    await this.client
      .from("photos")
      .update({ ...meta, drive_url: driveUrl })
      .eq("drive_file_id", oldFileId)
      .throwOnError();

    await this.nullDescriptionEmbedding(newFileId);
  }

  async deletePhoto(driveFileId: string): Promise<void> {
    await this.client.from("photos").delete().eq("drive_file_id", driveFileId).throwOnError();
  }

  // ── Queries ──

  async getAllPhotos(): Promise<PipelinePhoto[]> {
    return this.paginate((offset, limit) =>
      this.client.from("photos").select("*").range(offset, offset + limit - 1),
    );
  }

  async getPhotosByStatus(statuses: string[]): Promise<PipelinePhoto[]> {
    return this.paginate((offset, limit) =>
      this.client
        .from("photos")
        .select("*")
        .in("status", statuses)
        .range(offset, offset + limit - 1),
    );
  }

  async getPhotosMissingEmbedding(): Promise<PipelinePhoto[]> {
    return this.paginate((offset, limit) =>
      this.client
        .from("photos")
        .select("*")
        .eq("status", "completed")
        .is("description_embedding", null)
        .range(offset, offset + limit - 1),
    );
  }

  async getPhotosMissingPhash(): Promise<PipelinePhoto[]> {
    return this.paginate((offset, limit) =>
      this.client
        .from("photos")
        .select("*")
        .eq("status", "completed")
        .is("phash", null)
        .range(offset, offset + limit - 1),
    );
  }

  async getExistingFaceFileIds(): Promise<Set<string>> {
    const rows = await this.paginate<{ drive_file_id: string }>((offset, limit) =>
      this.client
        .from("face_embeddings")
        .select("drive_file_id")
        .range(offset, offset + limit - 1),
    );
    return new Set(rows.map((r) => r.drive_file_id));
  }

  // ── Updates ──

  async updatePhotoMetadata(
    driveFileId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.client
      .from("photos")
      .update(metadata)
      .eq("drive_file_id", driveFileId)
      .throwOnError();
  }

  async nullDescriptionEmbedding(driveFileId: string): Promise<void> {
    await this.client
      .from("photos")
      .update({ description_embedding: null })
      .eq("drive_file_id", driveFileId)
      .throwOnError();
  }

  async updateFaceEmbeddingMetadata(
    driveFileId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.client
      .from("face_embeddings")
      .update(metadata)
      .eq("drive_file_id", driveFileId)
      .throwOnError();
  }

  async updateDescriptionEmbeddingsBatch(
    updates: Array<{ driveFileId: string; embedding: number[] }>,
  ): Promise<number> {
    if (!updates.length) return 0;

    let count = 0;
    for (const { driveFileId, embedding } of updates) {
      const { data } = await this.client
        .from("photos")
        .update({ description_embedding: embedding })
        .eq("drive_file_id", driveFileId)
        .is("description_embedding", null)
        .select("drive_file_id");

      if (data && data.length > 0) count++;
    }
    return count;
  }

  async upsertFaceEmbedding(row: FaceEmbeddingRow): Promise<void> {
    await this.client
      .from("face_embeddings")
      .upsert(row, { onConflict: "drive_file_id,face_index" })
      .throwOnError();
  }

  async updatePhash(driveFileId: string, phashValue: bigint): Promise<void> {
    await this.client
      .from("photos")
      .update({ phash: Number(phashValue) })
      .eq("drive_file_id", driveFileId)
      .throwOnError();
  }

  async hasEmbeddingColumn(): Promise<boolean> {
    try {
      await this.client.from("photos").select("description_embedding").limit(1);
      return true;
    } catch {
      return false;
    }
  }
}
