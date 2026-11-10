// Severity is stored as text, so a plain ORDER BY severity sorts it
// alphabetically (critical, high, info, low, medium). Every query that lists
// findings should order by this instead.
export const SEVERITY_ORDER_SQL = `CASE severity
  WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
  WHEN 'low' THEN 4 ELSE 5 END`;
