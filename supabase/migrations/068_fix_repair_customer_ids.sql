-- ================================================================
-- Migration 068: Fix legacy repair customer associations & statuses
-- Repairs inserted by an earlier 067 attempt have NULL customer_id
-- and lowercase/underscore status names. This script fixes both.
-- ================================================================

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS _legacy_id TEXT;

DO $$
DECLARE
  biz UUID := 'b0067485-37f0-4a00-a958-39148da5ab59';
  b3  UUID := '39f8e567-facd-46ff-a0fb-7b4c32d9488f';
  b5  UUID := '39f8e567-facd-46ff-a0fb-7b4c32d9488f';
  b6  UUID := 'cee4de24-b815-4e58-8473-d8967e072e41';
BEGIN

  -- ── Step 1: Tag existing customers with their legacy IDs ─────
  -- Matches on phone AND first_name (case-insensitive).
  -- Skips any customer that already has a _legacy_id set.
  UPDATE public.customers c SET _legacy_id = m.lid
  FROM (VALUES
    ('6',  'Franco',   '07309097444'),
    ('25', 'ross',     '07367206437'),
    ('26', 'Kayle',    '07926724215'),
    ('27', 'precious', '07464141198'),
    ('28', 'james',    '07919385564'),
    ('29', 'paul',     '07484200740'),
    ('36', 'ewan',     '07501005238'),
    ('37', 'francis',  '07850496409'),
    ('38', 'anil',     '07535861234'),
    ('39', 'erin',     '07766500297'),
    ('44', 'david',    '07900070259'),
    ('45', 'james',    '07519023735'),
    ('46', 'sada',     '07956002168'),
    ('50', 'gordon',   '07828776596'),
    ('51', 'kane',     '077368858764'),
    ('53', 'derek',    '07968133426'),
    ('57', 'euan',     '07305359811'),
    ('61', 'syliiia',  '07481831943'),
    ('62', 'Simone',   '07913355404'),
    ('63', 'Tam',      '04504226924'),
    ('64', 'Matin',    '07842629656'),
    ('65', 'Rebecca',  '07510803197'),
    ('66', 'Zech',     '07377653302'),
    ('67', 'Jordon',   '0755201800'),
    ('68', 'Leuot',    '07712554063'),
    ('69', 'Micella',  '07481171887'),
    ('70', 'Andrew',   '07000000'),
    ('71', 'Laura',    '000000000'),
    ('72', 'kirsty',   '07774550334'),
    ('73', 'jackie',   '07342911788'),
    ('78', 'jared',    '07455795760'),
    ('79', 'ian',      '07896030725'),
    ('80', 'joy',      '07988265362'),
    ('81', 'douglas',  '07899903374'),
    ('82', 'james',    '07'),
    ('83', 'SHAUN',    '07771986826'),
    ('84', 'EMILIA',   '07507500757'),
    ('85', 'andy',     '07788823958'),
    ('86', 'sandra',   '07728597189'),
    ('87', 'Europa',   '07791786620'),
    ('88', 'MICHEAL',  '07841465287'),
    ('4',  'mark',     '07471425217'),
    ('5',  'Customer', '07542169512'),
    ('32', 'leigh',    '07825706705'),
    ('34', 'JILLIAN',  '07858931390'),
    ('35', 'ROSS',     '07311265847'),
    ('59', 'Bob',      '4582556655'),
    ('48', 'robert',   '01506437916'),
    ('49', 'no name',  '07723031961'),
    ('52', 'mohammed', '07767544730'),
    ('54', 'MILLER',   '07586563590'),
    ('55', 'DYLAN',    '07'),
    ('56', 'JOHN',     '07934829364'),
    ('58', 'aqarius',  '07971237810'),
    ('60', 'june',     '07450825526'),
    ('74', 'ewan',     '07760196378'),
    ('75', 'lesiey',   '07411332424'),
    ('76', 'venisaaa', '07426724489'),
    ('77', 'billy',    '07983918826'),
    ('89', 'Adedoyin', '07561776675')
  ) AS m(lid, fname, phone)
  WHERE c.phone = m.phone
    AND c.first_name ILIKE m.fname
    AND c._legacy_id IS NULL;

  -- ── Step 2: Insert any customers still missing ───────────────
  -- Skips rows where a customer with that _legacy_id already exists.
  INSERT INTO public.customers
    (business_id, first_name, last_name, email, phone, address, business_name, branch_id, _legacy_id)
  SELECT biz, v.fname, v.lname, v.email, v.phone, NULL, v.bname, v.branch, v.lid
  FROM (VALUES
    ('6',  'Franco',   NULL,                 NULL,                         '07309097444',  NULL,                     b3),
    ('25', 'ross',     NULL,                 NULL,                         '07367206437',  NULL,                     b3),
    ('26', 'Kayle',    'forest',             NULL,                         '07926724215',  NULL,                     b3),
    ('27', 'precious', NULL,                 NULL,                         '07464141198',  NULL,                     b3),
    ('28', 'james',    NULL,                 NULL,                         '07919385564',  NULL,                     b3),
    ('29', 'paul',     NULL,                 NULL,                         '07484200740',  NULL,                     b3),
    ('36', 'ewan',     'doyle',              NULL,                         '07501005238',  NULL,                     b3),
    ('37', 'francis',  NULL,                 NULL,                         '07850496409',  NULL,                     b3),
    ('38', 'anil',     NULL,                 NULL,                         '07535861234',  NULL,                     b3),
    ('39', 'erin',     NULL,                 NULL,                         '07766500297',  NULL,                     b3),
    ('44', 'david',    NULL,                 NULL,                         '07900070259',  NULL,                     b3),
    ('45', 'james',    'donoghue',           NULL,                         '07519023735',  NULL,                     b3),
    ('46', 'sada',     NULL,                 NULL,                         '07956002168',  NULL,                     b3),
    ('50', 'gordon',   NULL,                 NULL,                         '07828776596',  NULL,                     b3),
    ('51', 'kane',     NULL,                 NULL,                         '077368858764', NULL,                     b3),
    ('53', 'derek',    'patterson',          NULL,                         '07968133426',  NULL,                     b3),
    ('57', 'euan',     NULL,                 NULL,                         '07305359811',  NULL,                     b3),
    ('61', 'syliiia',  NULL,                 NULL,                         '07481831943',  NULL,                     b3),
    ('62', 'Simone',   NULL,                 NULL,                         '07913355404',  NULL,                     b3),
    ('63', 'Tam',      'frank',              NULL,                         '04504226924',  NULL,                     b3),
    ('64', 'Matin',    NULL,                 NULL,                         '07842629656',  NULL,                     b3),
    ('65', 'Rebecca',  NULL,                 NULL,                         '07510803197',  NULL,                     b3),
    ('66', 'Zech',     NULL,                 NULL,                         '07377653302',  NULL,                     b3),
    ('67', 'Jordon',   NULL,                 NULL,                         '0755201800',   NULL,                     b3),
    ('68', 'Leuot',    NULL,                 NULL,                         '07712554063',  NULL,                     b3),
    ('69', 'Micella',  NULL,                 NULL,                         '07481171887',  NULL,                     b3),
    ('70', 'Andrew',   NULL,                 NULL,                         '07000000',     NULL,                     b3),
    ('71', 'Laura',    NULL,                 NULL,                         '000000000',    NULL,                     b3),
    ('72', 'kirsty',   NULL,                 NULL,                         '07774550334',  NULL,                     b3),
    ('73', 'jackie',   NULL,                 NULL,                         '07342911788',  NULL,                     b3),
    ('78', 'jared',    NULL,                 NULL,                         '07455795760',  NULL,                     b3),
    ('79', 'ian',      NULL,                 NULL,                         '07896030725',  NULL,                     b3),
    ('80', 'joy',      NULL,                 NULL,                         '07988265362',  NULL,                     b3),
    ('81', 'douglas',  NULL,                 NULL,                         '07899903374',  NULL,                     b3),
    ('82', 'james',    NULL,                 NULL,                         '07',           NULL,                     b3),
    ('83', 'SHAUN',    NULL,                 NULL,                         '07771986826',  NULL,                     b3),
    ('84', 'EMILIA',   NULL,                 NULL,                         '07507500757',  NULL,                     b3),
    ('85', 'andy',     NULL,                 NULL,                         '07788823958',  NULL,                     b3),
    ('86', 'sandra',   NULL,                 NULL,                         '07728597189',  NULL,                     b3),
    ('87', 'Europa',   'Bathrooms',          NULL,                         '07791786620',  'Europa Bathrooms',       b3),
    ('88', 'MICHEAL',  NULL,                 NULL,                         '07841465287',  NULL,                     b3),
    ('4',  'mark',     NULL,                 NULL,                         '07471425217',  NULL,                     b6),
    ('5',  'Customer', NULL,                 NULL,                         '07542169512',  NULL,                     b6),
    ('32', 'leigh',    NULL,                 NULL,                         '07825706705',  NULL,                     b6),
    ('34', 'JILLIAN',  NULL,                 NULL,                         '07858931390',  NULL,                     b6),
    ('35', 'ROSS',     NULL,                 NULL,                         '07311265847',  NULL,                     b6),
    ('59', 'Bob',      'Stanley',            'justplanenuts45@gmail.com',  '4582556655',   NULL,                     b5),
    ('48', 'robert',   'jackson',            NULL,                         '01506437916',  NULL,                     b6),
    ('49', 'no name',  NULL,                 NULL,                         '07723031961',  NULL,                     b6),
    ('52', 'mohammed', NULL,                 NULL,                         '07767544730',  NULL,                     b6),
    ('54', 'MILLER',   NULL,                 NULL,                         '07586563590',  NULL,                     b6),
    ('55', 'DYLAN',    NULL,                 NULL,                         '07',           NULL,                     b6),
    ('56', 'JOHN',     NULL,                 NULL,                         '07934829364',  NULL,                     b6),
    ('58', 'aqarius',  'thermol system',     NULL,                         '07971237810',  'aqarius thermol system', b6),
    ('60', 'june',     NULL,                 NULL,                         '07450825526',  NULL,                     b6),
    ('74', 'ewan',     NULL,                 NULL,                         '07760196378',  NULL,                     b6),
    ('75', 'lesiey',   NULL,                 NULL,                         '07411332424',  NULL,                     b6),
    ('76', 'venisaaa', NULL,                 NULL,                         '07426724489',  NULL,                     b6),
    ('77', 'billy',    NULL,                 NULL,                         '07983918826',  NULL,                     b6),
    ('89', 'Adedoyin', 'david adebisi',      'deydoyim@gmail.com',         '07561776675',  NULL,                     b6)
  ) AS v(lid, fname, lname, email, phone, bname, branch)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.customers WHERE _legacy_id = v.lid
  );

  -- ── Step 3: Link repairs to their customers ──────────────────
  -- Updates customer_id on all legacy repairs (overwrites NULL or
  -- any previously wrong value) using the job_number → legacy_id map.
  UPDATE public.repairs r
  SET customer_id = c.id
  FROM (VALUES
    ('78613','6'), ('78638','25'), ('78639','26'), ('78640','27'),
    ('78641','28'), ('78642','29'), ('78646','4'),  ('78647','32'),
    ('78648','5'),  ('78650','34'), ('78651','35'), ('78652','36'),
    ('78653','37'), ('78654','38'), ('78655','39'), ('78661','44'),
    ('78662','45'), ('78663','46'), ('78665','48'), ('78666','49'),
    ('78667','50'), ('78668','51'), ('78669','52'), ('78670','53'),
    ('78671','54'), ('78672','55'), ('78673','56'), ('78674','57'),
    ('78675','58'), ('78676','59'), ('78677','60'), ('78678','61'),
    ('78679','62'), ('78680','63'), ('78681','64'), ('78682','65'),
    ('78683','66'), ('78684','67'), ('78685','68'), ('78686','69'),
    ('78687','70'), ('78688','46'), ('78689','26'), ('78690','71'),
    ('78691','72'), ('78692','73'), ('78693','74'), ('78694','75'),
    ('78695','76'), ('78696','77'), ('78697','78'), ('78698','79'),
    ('78699','80'), ('78700','81'), ('78701','82'), ('78702','83'),
    ('78703','84'), ('78704','85'), ('78705','86'), ('78706','82'),
    ('78707','59'), ('78708','87'), ('78709','88'), ('78710','89')
  ) AS m(jnum, lid)
  JOIN public.customers c ON c._legacy_id = m.lid
  WHERE r.job_number = m.jnum;

  -- ── Step 4: Normalise status names for legacy repairs ────────
  UPDATE public.repairs SET status = 'Received'             WHERE status IN ('received','Received ')            AND job_number ~ '^786';
  UPDATE public.repairs SET status = 'Repaired'             WHERE status IN ('repaired','Repaired ')            AND job_number ~ '^786';
  UPDATE public.repairs SET status = 'In Progress'          WHERE status IN ('in_progress','In Progress ')      AND job_number ~ '^786';
  UPDATE public.repairs SET status = 'Collected'            WHERE status IN ('collected','Collected ')          AND job_number ~ '^786';
  UPDATE public.repairs SET status = 'Waiting for Parts'    WHERE status IN ('waiting_for_parts')               AND job_number ~ '^786';
  UPDATE public.repairs SET status = 'Diagnosed'            WHERE status IN ('diagnosed')                       AND job_number ~ '^786';
  UPDATE public.repairs SET status = 'Unrepairable'         WHERE status IN ('unrepairable')                    AND job_number ~ '^786';
  UPDATE public.repairs SET status = 'Waiting for Customer' WHERE status IN ('waiting_for_customer')            AND job_number ~ '^786';

  -- ── Step 5: Fix issue/fault for repairs stored with wrong values ─
  -- Repairs from an earlier broken migration may have 'Not specified'
  -- or other wrong values. Restore the correct fault descriptions.
  UPDATE public.repairs SET issue = m.issue
  FROM (VALUES
    ('78613', 'lcd'),
    ('78638', 'General Repair'),
    ('78639', 'hard drive and dell charger'),
    ('78640', 'lcd replacement'),
    ('78641', 'fan'),
    ('78642', 'dead'),
    ('78646', 'screen replacement'),
    ('78647', 'rear camera'),
    ('78648', 'General Repair'),
    ('78650', 'Screen Damage'),
    ('78651', 'General Repair'),
    ('78652', 'battery, charging port, back glass'),
    ('78653', 'screen replacement, rear glass'),
    ('78654', 'battery'),
    ('78655', 'rear glass'),
    ('78661', 'lcd battery, back glass and cover'),
    ('78662', 'General Repair'),
    ('78663', 'charging ic shorted'),
    ('78665', 'charging port'),
    ('78666', 'Screen Damage'),
    ('78667', 'charging ic'),
    ('78668', 'lcd'),
    ('78669', 'Screen Damage'),
    ('78670', 'no sim'),
    ('78671', 'CHARGING PORTE'),
    ('78672', 'Screen Damage, REAR GLASS'),
    ('78673', 'Screen Damage'),
    ('78674', 'digitizer'),
    ('78675', 'Screen Damage'),
    ('78676', 'Screen Damage'),
    ('78677', 'Screen Damage'),
    ('78678', 'charging port'),
    ('78679', 'LCD'),
    ('78680', 'LCD'),
    ('78681', 'lcd'),
    ('78682', 'Charging'),
    ('78683', 'Body & LCD'),
    ('78684', 'lcd'),
    ('78685', 'battery'),
    ('78686', 'Charging point'),
    ('78687', 'Display ic'),
    ('78688', 'Charging ic'),
    ('78689', 'charging point'),
    ('78690', 'rechecking'),
    ('78691', 'Water Damage'),
    ('78692', 'lcd'),
    ('78693', 'General Repair'),
    ('78694', 'General Repair'),
    ('78695', 'General Repair'),
    ('78696', 'General Repair'),
    ('78697', 'same charging port repair'),
    ('78698', 'lcd, battery, rear glass'),
    ('78699', 'no power'),
    ('78700', 'LCD'),
    ('78701', 'JOY STICK'),
    ('78702', 'FLASH'),
    ('78703', 'Charging port, power button'),
    ('78704', 'no service'),
    ('78705', 'restarting'),
    ('78706', 'battery'),
    ('78707', 'Water Damage'),
    ('78708', 'rear glass, battery'),
    ('78709', 'LCD, BATTERY'),
    ('78710', 'Inner Lcd, Battery')
  ) AS m(jnum, issue)
  WHERE public.repairs.job_number = m.jnum
    AND (public.repairs.issue IS NULL
      OR public.repairs.issue = ''
      OR public.repairs.issue ILIKE 'not specified'
      OR public.repairs.issue ILIKE 'general repair');

END $$;

-- ── Step 5: Clean up temp column ────────────────────────────────
ALTER TABLE public.customers DROP COLUMN IF EXISTS _legacy_id;

-- ── Verify ───────────────────────────────────────────────────────
-- After running, check these in the SQL Editor:
--   SELECT COUNT(*) FROM repairs WHERE job_number ~ '^786' AND customer_id IS NULL;
--   -- Should return 0
--
--   SELECT r.job_number, c.first_name, c.phone, r.status
--   FROM repairs r JOIN customers c ON r.customer_id = c.id
--   WHERE r.job_number ~ '^786' ORDER BY r.job_number DESC LIMIT 10;
--   -- Should show customer names
