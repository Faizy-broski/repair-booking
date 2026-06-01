import { adminSupabase } from '@/backend/config/supabase'

const BUCKET = 'pdf-cache'
const URL_TTL_SECONDS = 600 // 10-minute signed URLs

export const PdfCacheService = {
  cachePath(type: 'invoices' | 'sales', id: string): string {
    return `${type}/${id}.pdf`
  },

  /**
   * Returns a signed download URL if the PDF exists in Storage, otherwise null.
   *
   * Uses a single createSignedUrl() call — Supabase validates file existence
   * server-side and returns an error if the object is missing, so we get
   * both the existence check and the URL in one round-trip (~100–150 ms).
   * This replaces the previous list() + createSignedUrl() pattern which was
   * two sequential round-trips (~300 ms + ~150 ms = ~450 ms).
   */
  async getSignedUrl(path: string, filename: string): Promise<string | null> {
    try {
      const { data, error } = await adminSupabase.storage
        .from(BUCKET)
        .createSignedUrl(path, URL_TTL_SECONDS, { download: filename })
      if (error || !data?.signedUrl) return null
      return data.signedUrl
    } catch {
      return null
    }
  },

  /**
   * Uploads the PDF buffer and returns a fresh signed URL.
   * upsert:true handles concurrent cache-miss races gracefully.
   */
  async store(path: string, buffer: Buffer, filename: string): Promise<string | null> {
    try {
      const { error } = await adminSupabase.storage.from(BUCKET).upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '86400',
      })
      if (error) return null
      const { data } = await adminSupabase.storage
        .from(BUCKET)
        .createSignedUrl(path, URL_TTL_SECONDS, { download: filename })
      return data?.signedUrl ?? null
    } catch {
      return null
    }
  },

  /**
   * Deletes the cached PDF so the next download regenerates a fresh copy.
   * Called when an invoice is updated or its status changes.
   * Safe to fire-and-forget — never blocks the response.
   */
  async invalidate(type: 'invoices', id: string): Promise<void> {
    try {
      await adminSupabase.storage.from(BUCKET).remove([this.cachePath(type, id)])
    } catch { /* non-critical */ }
  },
}
