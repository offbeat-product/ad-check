-- Delete project_files with blob: URLs (these have no actual data, just browser-local references)
DELETE FROM project_files WHERE file_data LIKE 'blob:%';