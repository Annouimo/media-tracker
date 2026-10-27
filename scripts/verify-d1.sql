SELECT 'works' AS metric, COUNT(*) AS value FROM works;
SELECT 'logs' AS metric, COUNT(*) AS value FROM logs;
SELECT 'works_with_logs' AS metric, COUNT(DISTINCT work_id) AS value FROM logs;
SELECT 'date_only' AS metric, COUNT(*) AS value FROM logs WHERE logged_at IS NULL;
SELECT 'timestamped' AS metric, COUNT(*) AS value FROM logs WHERE logged_at IS NOT NULL;
SELECT 'inferred' AS metric, COUNT(*) AS value FROM logs WHERE inferred = 1;
SELECT 'missing_added_at' AS metric, COUNT(*) AS value FROM works WHERE added_at IS NULL;
SELECT 'legacy_id' AS metric, COUNT(*) AS value FROM works WHERE legacy_id IS NOT NULL;
SELECT 'orphan_logs' AS metric, COUNT(*) AS value FROM logs WHERE work_id NOT IN (SELECT id FROM works);

SELECT COALESCE(l.status, 'wish') AS status, COUNT(*) AS count
FROM works w
LEFT JOIN logs l
  ON l.work_id = w.id
 AND l.seq = (SELECT MAX(seq) FROM logs WHERE work_id = w.id)
WHERE w.deleted_at IS NULL
GROUP BY status
ORDER BY status;
