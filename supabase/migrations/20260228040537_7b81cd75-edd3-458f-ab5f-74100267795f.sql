
-- === correction_logs のRLSポリシー修正 ===
DROP POLICY IF EXISTS "correction_logs_select" ON correction_logs;
DROP POLICY IF EXISTS "correction_logs_insert" ON correction_logs;
DROP POLICY IF EXISTS "correction_logs_update" ON correction_logs;

CREATE POLICY "correction_logs_select" ON correction_logs FOR SELECT USING (true);
CREATE POLICY "correction_logs_insert" ON correction_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "correction_logs_update" ON correction_logs FOR UPDATE USING (true);

-- === rule_candidates のRLSポリシー修正 ===
DROP POLICY IF EXISTS "rule_candidates_select" ON rule_candidates;
DROP POLICY IF EXISTS "rule_candidates_insert" ON rule_candidates;
DROP POLICY IF EXISTS "rule_candidates_update" ON rule_candidates;

CREATE POLICY "rule_candidates_select" ON rule_candidates FOR SELECT USING (true);
CREATE POLICY "rule_candidates_insert" ON rule_candidates FOR INSERT WITH CHECK (true);
CREATE POLICY "rule_candidates_update" ON rule_candidates FOR UPDATE USING (true);
