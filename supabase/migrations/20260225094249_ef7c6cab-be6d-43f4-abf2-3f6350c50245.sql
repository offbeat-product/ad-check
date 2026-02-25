
CREATE TABLE public.check_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  process_type text NOT NULL,
  rule_id text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.check_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view check_rules"
  ON public.check_rules FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can insert check_rules"
  ON public.check_rules FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can update check_rules"
  ON public.check_rules FOR UPDATE
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can delete check_rules"
  ON public.check_rules FOR DELETE
  USING (auth.role() = 'authenticated'::text);

CREATE INDEX idx_check_rules_product_process ON public.check_rules(product_id, process_type);
