-- Update file_size_limit on all storage buckets to 500MB
UPDATE storage.buckets SET file_size_limit = 524288000 WHERE id = 'audios';
UPDATE storage.buckets SET file_size_limit = 524288000 WHERE id = 'videos';
UPDATE storage.buckets SET file_size_limit = 524288000 WHERE id = 'deliverables';
UPDATE storage.buckets SET file_size_limit = 524288000 WHERE id = 'reference-files';
UPDATE storage.buckets SET file_size_limit = 524288000 WHERE id = 'comment-attachments';