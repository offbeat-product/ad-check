
UPDATE check_results
SET overall_status = 'B', updated_at = now()
WHERE id IN (
  'e077d45c-ce21-4522-a854-d3094158483f',
  '9609b629-20ef-46bb-b769-60579fccca23',
  '1442a3b5-4e35-4b66-b2a7-6cdab21de7ca',
  'ff41106d-9b14-4bad-8d45-9eb3fa7c3793',
  '8b05412d-220d-4762-a10a-6068bf6155c3',
  'bc0f7bc6-38ef-482c-8b86-ec36b45dd940',
  '4480dec0-a7d0-4ed1-a0ca-85159613d530',
  '62a7b9b5-15b0-4778-9850-357d848649bf',
  'e45dbcf0-a4fa-48c1-8123-8e934820c2a2'
);
