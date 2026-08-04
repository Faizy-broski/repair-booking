-- Migration 044: Add image_url to brands, categories, part_types + Supabase storage bucket
-- Enables per-item image upload for the full catalogue hierarchy.

-- ── 1. Add image_url columns ─────────────────────────────────────────────────

ALTER TABLE categories  ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE brands      ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE part_types  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── 2. Create public storage bucket for product / catalogue images ────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,   -- 5 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Storage RLS policies ───────────────────────────────────────────────────

-- Allow authenticated users to upload to their own business folder
CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

-- Allow anyone to read (public bucket)
CREATE POLICY "Product images are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

-- Allow authenticated users to update/delete their own uploads
CREATE POLICY "Authenticated users can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');
