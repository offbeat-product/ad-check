-- Align storage bucket file_size_limit with client max upload (5GB = 5368709120 bytes)
UPDATE storage.buckets SET file_size_limit = 5368709120 WHERE id = 'audios';
UPDATE storage.buckets SET file_size_limit = 5368709120 WHERE id = 'videos';
UPDATE storage.buckets SET file_size_limit = 5368709120 WHERE id = 'deliverables';
UPDATE storage.buckets SET file_size_limit = 5368709120 WHERE id = 'reference-files';
UPDATE storage.buckets SET file_size_limit = 5368709120 WHERE id = 'comment-attachments';
