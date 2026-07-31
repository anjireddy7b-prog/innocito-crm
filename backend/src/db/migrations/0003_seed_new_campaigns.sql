-- Data migration: expand the Campaign dropdown with the new business-line
-- campaigns requested for the Lead Creation module enhancement. Existing
-- campaigns (e.g. those created from spreadsheet imports) are untouched —
-- this only adds rows, keyed by a unique `code` so re-running is a no-op.
INSERT INTO "campaigns" ("name", "code", "description", "status")
VALUES
  ('Staffing', 'STAFFING', 'Staffing services campaign', 'ACTIVE'),
  ('Pen Testing', 'PENTEST', 'Penetration testing services campaign', 'ACTIVE'),
  ('AI-Led Quality Engineering', 'AI_LED_QE', 'AI-Led Quality Engineering (AI-Led QE) campaign', 'ACTIVE'),
  ('AI-Led Digital Engineering', 'AI_LED_DE', 'AI-Led Digital Engineering (AI-Led DE) campaign', 'ACTIVE'),
  ('Generic', 'GENERIC', 'Generic / uncategorized campaign', 'ACTIVE')
ON CONFLICT ("code") DO NOTHING;
