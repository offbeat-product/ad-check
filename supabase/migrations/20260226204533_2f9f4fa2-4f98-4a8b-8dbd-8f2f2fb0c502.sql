
-- Make reference-files bucket public so external systems (n8n) can access files
UPDATE storage.buckets SET public = true WHERE id = 'reference-files';
