
-- 修正指示の蓄積テーブル
CREATE TABLE public.correction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  process_type TEXT NOT NULL,
  pattern_id UUID,
  file_id UUID REFERENCES project_files(id) ON DELETE SET NULL,
  check_result_id UUID,
  comment_id UUID,
  correction_text TEXT NOT NULL,
  correction_category TEXT,
  ai_extracted_rule TEXT,
  ai_severity TEXT,
  ai_process_types TEXT[],
  ai_scope TEXT DEFAULT 'project',
  similarity_hash TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  rule_status TEXT DEFAULT 'pending',
  approved_rule_id UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID
);

CREATE INDEX idx_correction_logs_product ON correction_logs(product_id);
CREATE INDEX idx_correction_logs_process ON correction_logs(process_type);
CREATE INDEX idx_correction_logs_status ON correction_logs(rule_status);

ALTER TABLE public.correction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "correction_logs_select" ON correction_logs
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "correction_logs_insert" ON correction_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "correction_logs_update" ON correction_logs
  FOR UPDATE USING (auth.role() = 'authenticated'::text);

-- ルール候補テーブル
CREATE TABLE public.rule_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  process_type TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'project',
  rule_text TEXT NOT NULL,
  category TEXT,
  severity TEXT DEFAULT 'medium',
  source_correction_ids UUID[],
  source_count INT DEFAULT 1,
  similar_existing_rule_id UUID,
  similarity_score FLOAT,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  approved_rule_id UUID,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rule_candidates_product ON rule_candidates(product_id);
CREATE INDEX idx_rule_candidates_status ON rule_candidates(status);

ALTER TABLE public.rule_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rule_candidates_select" ON rule_candidates
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "rule_candidates_insert" ON rule_candidates
  FOR INSERT WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "rule_candidates_update" ON rule_candidates
  FOR UPDATE USING (auth.role() = 'authenticated'::text);

-- check_rulesテーブルにsource_correction_countカラム追加
ALTER TABLE public.check_rules ADD COLUMN IF NOT EXISTS source_correction_count INT DEFAULT 0;
