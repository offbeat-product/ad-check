
-- Add media_timestamp column to comments for video/audio playback position
ALTER TABLE public.comments ADD COLUMN media_timestamp real NULL;

-- Add mentions column to store mentioned user IDs
ALTER TABLE public.comments ADD COLUMN mentions uuid[] NULL;
