-- Add sort_order to clients and products for drag-and-drop reordering
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
