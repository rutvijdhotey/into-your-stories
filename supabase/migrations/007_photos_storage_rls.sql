-- RLS policies for the 'photos' storage bucket.
-- Path convention: {userId}/{noteOfflineId}/{index}.jpg
-- The first folder segment must always equal the uploading user's ID.

-- INSERT: authenticated users may upload only into their own folder
CREATE POLICY "photos: authenticated users can upload own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: required because photoService uses upsert:true
CREATE POLICY "photos: authenticated users can update own files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: public read so getPublicUrl works without auth tokens
CREATE POLICY "photos: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'photos');

-- DELETE: authenticated users may remove only their own files
CREATE POLICY "photos: authenticated users can delete own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
