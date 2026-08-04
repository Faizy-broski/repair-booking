-- ================================================================
-- Migration 067: Import legacy repairs_customers + repairs data
-- Business : Phone fix broxburn  (b0067485-37f0-4a00-a958-39148da5ab59)
-- Branches :
--   Phone fix broxburn  → 39f8e567-facd-46ff-a0fb-7b4c32d9488f  (old biz 3 & 5)
--   Techspot electronics→ cee4de24-b815-4e58-8473-d8967e072e41  (old biz 4 & 6)
-- ================================================================
-- Ready to run — paste into Supabase SQL Editor and execute.
-- ================================================================

-- Step 1: Add temp tracking column for customer ID mapping
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS _legacy_id TEXT;

DO $$
DECLARE
  -- Branch mapping (confirmed):
  --   old biz_id 3 → Phone fix broxburn   (39f8e567-facd-46ff-a0fb-7b4c32d9488f)
  --   old biz_id 4 → Techspot electronics  (cee4de24-b815-4e58-8473-d8967e072e41)
  --   old biz_id 5 → Phone fix broxburn   (TSN test data → main branch)
  --   old biz_id 6 → Techspot electronics  (cee4de24-b815-4e58-8473-d8967e072e41)
  biz UUID := 'b0067485-37f0-4a00-a958-39148da5ab59'; -- Phone fix broxburn (business)
  b3 UUID := '39f8e567-facd-46ff-a0fb-7b4c32d9488f';  -- Phone fix broxburn branch
  b4 UUID := 'cee4de24-b815-4e58-8473-d8967e072e41';  -- Techspot electronics branch
  b5 UUID := '39f8e567-facd-46ff-a0fb-7b4c32d9488f';  -- Phone fix broxburn branch (TSN test)
  b6 UUID := 'cee4de24-b815-4e58-8473-d8967e072e41';  -- Techspot electronics branch
BEGIN

  -- ── Step 2: Insert legacy customers (skip if already imported) ──
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE _legacy_id IS NOT NULL) THEN
  INSERT INTO public.customers
    (business_id, first_name, last_name, email, phone, address, business_name, branch_id, _legacy_id)
  VALUES
    -- Phone fix broxburn branch customers (old biz 3)
    (biz,'Franco',    NULL,              NULL,                           '07309097444',  NULL,                         NULL,                 b3, '6'),
    (biz,'ross',      NULL,              NULL,                           '07367206437',  NULL,                         NULL,                 b3, '25'),
    (biz,'Kayle',     'forest',          NULL,                           '07926724215',  NULL,                         NULL,                 b3, '26'),
    (biz,'precious',  NULL,              NULL,                           '07464141198',  NULL,                         NULL,                 b3, '27'),
    (biz,'james',     NULL,              NULL,                           '07919385564',  NULL,                         NULL,                 b3, '28'),
    (biz,'paul',      NULL,              NULL,                           '07484200740',  NULL,                         NULL,                 b3, '29'),
    (biz,'ewan',      'doyle',           NULL,                           '07501005238',  NULL,                         NULL,                 b3, '36'),
    (biz,'francis',   NULL,              NULL,                           '07850496409',  NULL,                         NULL,                 b3, '37'),
    (biz,'anil',      NULL,              NULL,                           '07535861234',  NULL,                         NULL,                 b3, '38'),
    (biz,'erin',      NULL,              NULL,                           '07766500297',  NULL,                         NULL,                 b3, '39'),
    (biz,'david',     NULL,              NULL,                           '07900070259',  NULL,                         NULL,                 b3, '44'),
    (biz,'james',     'donoghue',        NULL,                           '07519023735',  NULL,                         NULL,                 b3, '45'),
    (biz,'sada',      NULL,              NULL,                           '07956002168',  NULL,                         NULL,                 b3, '46'),
    (biz,'gordon',    NULL,              NULL,                           '07828776596',  NULL,                         NULL,                 b3, '50'),
    (biz,'kane',      NULL,              NULL,                           '077368858764', NULL,                         NULL,                 b3, '51'),
    (biz,'derek',     'patterson',       NULL,                           '07968133426',  NULL,                         NULL,                 b3, '53'),
    (biz,'euan',      NULL,              NULL,                           '07305359811',  NULL,                         NULL,                 b3, '57'),
    (biz,'syliiia',   NULL,              NULL,                           '07481831943',  NULL,                         NULL,                 b3, '61'),
    (biz,'Simone',    NULL,              NULL,                           '07913355404',  NULL,                         NULL,                 b3, '62'),
    (biz,'Tam',       'frank',           NULL,                           '04504226924',  NULL,                         NULL,                 b3, '63'),
    (biz,'Matin',     NULL,              NULL,                           '07842629656',  NULL,                         NULL,                 b3, '64'),
    (biz,'Rebecca',   NULL,              NULL,                           '07510803197',  NULL,                         NULL,                 b3, '65'),
    (biz,'Zech',      NULL,              NULL,                           '07377653302',  NULL,                         NULL,                 b3, '66'),
    (biz,'Jordon',    NULL,              NULL,                           '0755201800',   NULL,                         NULL,                 b3, '67'),
    (biz,'Leuot',     NULL,              NULL,                           '07712554063',  NULL,                         NULL,                 b3, '68'),
    (biz,'Micella',   NULL,              NULL,                           '07481171887',  NULL,                         NULL,                 b3, '69'),
    (biz,'Andrew',    NULL,              NULL,                           '07000000',     NULL,                         NULL,                 b3, '70'),
    (biz,'Laura',     NULL,              NULL,                           '000000000',    NULL,                         NULL,                 b3, '71'),
    (biz,'kirsty',    NULL,              NULL,                           '07774550334',  NULL,                         NULL,                 b3, '72'),
    (biz,'jackie',    NULL,              NULL,                           '07342911788',  NULL,                         NULL,                 b3, '73'),
    (biz,'jared',     NULL,              NULL,                           '07455795760',  NULL,                         NULL,                 b3, '78'),
    (biz,'ian',       NULL,              NULL,                           '07896030725',  NULL,                         NULL,                 b3, '79'),
    (biz,'joy',       NULL,              NULL,                           '07988265362',  NULL,                         NULL,                 b3, '80'),
    (biz,'douglas',   NULL,              NULL,                           '07899903374',  NULL,                         NULL,                 b3, '81'),
    (biz,'james',     NULL,              NULL,                           '07',           NULL,                         NULL,                 b3, '82'),
    (biz,'SHAUN',     NULL,              NULL,                           '07771986826',  NULL,                         NULL,                 b3, '83'),
    (biz,'EMILIA',    NULL,              NULL,                           '07507500757',  NULL,                         NULL,                 b3, '84'),
    (biz,'andy',      NULL,              NULL,                           '07788823958',  NULL,                         NULL,                 b3, '85'),
    (biz,'sandra',    NULL,              NULL,                           '07728597189',  NULL,                         NULL,                 b3, '86'),
    (biz,'Europa',    'Bathrooms',       NULL,                           '07791786620',  NULL,                         'Europa Bathrooms',   b3, '87'),
    (biz,'MICHEAL',   NULL,              NULL,                           '07841465287',  NULL,                         NULL,                 b3, '88'),
    -- Techspot electronics branch customers (old biz 4 & 6)
    (biz,'mark',      NULL,              NULL,                           '07471425217',  NULL,                         NULL,                 b6, '4'),
    (biz,'Customer',  NULL,              NULL,                           '07542169512',  NULL,                         NULL,                 b6, '5'),
    (biz,'leigh',     NULL,              NULL,                           '07825706705',  NULL,                         NULL,                 b6, '32'),
    (biz,'JILLIAN',   NULL,              NULL,                           '07858931390',  NULL,                         NULL,                 b6, '34'),
    (biz,'ROSS',      NULL,              NULL,                           '07311265847',  NULL,                         NULL,                 b6, '35'),
    (biz,'Bob',       'Stanley',         'justplanenuts45@gmail.com',    '4582556655',   '31061 Klaus Rd Hermiston',   NULL,                 b5, '59'),
    (biz,'robert',    'jackson',         NULL,                           '01506437916',  NULL,                         NULL,                 b6, '48'),
    (biz,'no name',   NULL,              NULL,                           '07723031961',  NULL,                         NULL,                 b6, '49'),
    (biz,'mohammed',  NULL,              NULL,                           '07767544730',  NULL,                         NULL,                 b6, '52'),
    (biz,'MILLER',    NULL,              NULL,                           '07586563590',  NULL,                         NULL,                 b6, '54'),
    (biz,'DYLAN',     NULL,              NULL,                           '07',           NULL,                         NULL,                 b6, '55'),
    (biz,'JOHN',      NULL,              NULL,                           '07934829364',  NULL,                         NULL,                 b6, '56'),
    (biz,'aqarius',   'thermol system',  NULL,                           '07971237810',  NULL,                         'aqarius thermol system', b6, '58'),
    (biz,'june',      NULL,              NULL,                           '07450825526',  NULL,                         NULL,                 b6, '60'),
    (biz,'ewan',      NULL,              NULL,                           '07760196378',  NULL,                         NULL,                 b6, '74'),
    (biz,'lesiey',    NULL,              NULL,                           '07411332424',  NULL,                         NULL,                 b6, '75'),
    (biz,'venisaaa',  NULL,              NULL,                           '07426724489',  NULL,                         NULL,                 b6, '76'),
    (biz,'billy',     NULL,              NULL,                           '07983918826',  NULL,                         NULL,                 b6, '77'),
    (biz,'Adedoyin',  'david adebisi',   'deydoyim@gmail.com',           '07561776675',  NULL,                         NULL,                 b6, '89');
  END IF;

  -- ── Step 3: Create temp branch map ─────────────────────────────
  CREATE TEMP TABLE _bm (biz_id INT, buuid UUID) ON COMMIT DROP;
  INSERT INTO _bm VALUES (3, b3), (4, b4), (5, b5), (6, b6);

  -- ── Step 4: Insert legacy repairs (skip if already imported) ───
  -- Columns: ticket_no | cust_legacy_id | biz_id | device_model | issue
  --        | est_cost | deposit | status | imei | due_date
  --        | customer_note | staff_note | created_at
  --
  -- Status mapping from old integer IDs:
  --   5 → Repaired        9 → Waiting for Parts   10 → Received
  --  11 → Diagnosed      12 → In Progress         15 → Repaired
  --  21 → Collected      23 → Unrepairable        24 → Repaired
  --  25 → Collected      26 → Waiting for Customer 29 → In Progress
  --  37 → Received
  --
  -- NOTE: These status names must exist in your repair_custom_statuses table.
  --       If they don''t match, update them below before running.

  IF NOT EXISTS (SELECT 1 FROM public.repairs WHERE job_number = '78613') THEN
  INSERT INTO public.repairs
    (branch_id, customer_id, job_number, device_model, issue,
     estimated_cost, deposit_paid, status, custom_fields,
     created_at, is_rush, notify_customer)
  SELECT
    bm.buuid,
    c.id,
    r.ticket_no,
    NULLIF(r.device_model, ''),
    r.issue,
    r.est_cost::numeric,
    r.deposit::numeric,
    r.status_name,
    jsonb_build_object(
      'imei',           NULLIF(r.imei, ''),
      'due_date',       NULLIF(r.due_date, ''),
      'customer_note',  NULLIF(r.customer_note, ''),
      'staff_note',     NULLIF(r.staff_note, ''),
      'payment_method', NULL
    ),
    r.created_at::timestamptz,
    false,
    false
  FROM (VALUES
    -- ticket_no | cust_legacy_id | biz_id | device_model              | issue                                  | est | dep | status                  | imei       | due_date     | customer_note           | staff_note                                             | created_at
    ('78613','6', 3,'honnor 200',                  'lcd',                                  '100','0', 'Received',               '',         '',           '',                      '',                                                     '2026-02-27 10:58:47'),
    ('78638','25',3,'nintendoswitch',               'General Repair',                       '80', '0', 'Received',               '',         '',           '',                      '',                                                     '2026-03-02 17:33:48'),
    ('78639','26',3,'dell inspiration 15',          'hard drive and dell charger',           '140','0', 'Repaired',               '',         '',           '',                      'replaced hard drive replaced charger waiting for charging port','2026-03-02 17:38:21'),
    ('78640','27',3,'apple MacBook model a1466',    'lcd replacement',                       '95', '0', 'Repaired',               '',         '',           '',                      '',                                                     '2026-03-02 17:41:24'),
    ('78641','28',3,'Asus gaming laptop',           'fan',                                  '60', '0', 'Waiting for Parts',      '',         '',           '',                      '',                                                     '2026-03-02 17:44:11'),
    ('78642','29',3,'Samsung galaxy A7',            'dead',                                 '100','0', 'Diagnosed',              '',         '',           'dead not charging',     'checked looks like the lcds is gone',                  '2026-03-02 18:11:56'),
    ('78646','4', 6,'ipad air 4',                   'screen replacement',                    '195','0', 'Waiting for Customer',   '',         '',           '',                      'waiting for customer',                                 '2026-03-03 11:17:05'),
    ('78647','32',6,'iphone 14 plus',               'rear camera',                           '120','0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-03 11:22:49'),
    ('78648','5', 6,'PS5',                          'General Repair',                        '30', '1', 'Collected',              '',         '2023-02-23', '',                      '',                                                     '2026-03-03 12:28:26'),
    ('78650','34',6,'A16',                          'Screen Damage',                         '70', '20','Collected',              '',         '',           '',                      'SC',                                                   '2026-03-03 12:40:11'),
    ('78651','35',6,'PS5',                          'General Repair',                        '90', '0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-03 12:42:30'),
    ('78652','36',3,'1 plus 8 pro',                 'battery, charging port, back glass',    '120','60','Repaired',               '',         '',           '',                      '',                                                     '2026-03-03 12:51:51'),
    ('78653','37',3,'S23 ultra',                    'screen replacement, rear glass',         '205','50','In Progress',            '',         '',           '',                      '',                                                     '2026-03-03 13:00:49'),
    ('78654','38',3,'Z flip 4',                     'battery',                               '85', '25','Repaired',               '',         '',           '',                      '',                                                     '2026-03-03 13:03:05'),
    ('78655','39',3,'iPhone 14 pro',                'rear glass',                            '60', '0', 'In Progress',            '',         '',           '',                      '',                                                     '2026-03-03 13:14:53'),
    ('78661','44',3,'iPhone 14 pro',                'lcd battery, back glass and cover',     '200','0', 'Diagnosed',              '',         '2026-03-04', '',                      '',                                                     '2026-03-04 11:53:39'),
    ('78662','45',3,'samsung tablet t515',          'General Repair',                        '90', '0', 'In Progress',            '',         '2026-03-04', '',                      'amount has been paid need to check the tablet looks like charging port problem','2026-03-04 12:51:47'),
    ('78663','46',3,'dell latitude',                'charging ic shorted',                   '130','0', 'Repaired',               '',         '2026-03-05', '',                      '',                                                     '2026-03-05 14:25:32'),
    ('78665','48',6,'sm-t510',                      'charging port',                         '40', '0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-06 11:10:55'),
    ('78666','49',6,'hmd samsung',                  'Screen Damage',                         '140','0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-06 11:18:22'),
    ('78667','50',3,'iPhone 13 pro max',            'charging ic',                           '100','0', 'In Progress',            '',         '',           '',                      '',                                                     '2026-03-06 12:54:12'),
    ('78668','51',3,'iPhone 8',                     'lcd',                                   '40', '0', 'In Progress',            '',         '',           '',                      '',                                                     '2026-03-06 16:00:30'),
    ('78669','52',6,'a07',                          'Screen Damage',                         '55', '10','Unrepairable',           '',         '',           '',                      '',                                                     '2026-03-06 17:33:40'),
    ('78670','53',3,'iPhone 16',                    'no sim',                                '80', '0', 'In Progress',            '',         '2026-03-07', '',                      '',                                                     '2026-03-07 10:48:57'),
    ('78671','54',6,'IPAD',                         'CHARGING PORTE',                        '65', '0', 'Waiting for Customer',   '',         '',           '',                      '',                                                     '2026-03-09 11:59:38'),
    ('78672','55',6,'IPHONE 16 PRO MAX',            'Screen Damage, REAR GLASS',             '210','0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-09 16:18:02'),
    ('78673','56',6,'S21 ULTRA',                    'Screen Damage',                         '145','0', 'Waiting for Customer',   '',         '',           '',                      '',                                                     '2026-03-16 17:25:05'),
    ('78674','57',3,'ipad 10th gen',                'digitizer',                             '180','0', 'In Progress',            '',         '2026-03-17', '',                      '90 digi 20 glass 30 charging 25 camera lens',          '2026-03-17 10:23:32'),
    ('78675','58',6,'ipad',                         'Screen Damage',                         '70', '0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-18 14:59:10'),
    ('78676','59',5,'test',                         'Screen Damage',                         '54', '4', 'Received',               '455231',   '2026-03-21', '',                      '',                                                     '2026-03-19 11:41:09'),
    ('78677','60',6,'a155f',                        'Screen Damage',                         '65', '30','Waiting for Customer',   '',         '2026-03-23', '',                      '',                                                     '2026-03-19 13:06:10'),
    ('78678','61',3,'acer',                         'charging port',                         '50', '0', 'In Progress',            '',         '',           '',                      '',                                                     '2026-03-23 15:59:49'),
    ('78679','62',3,'ipad a2377',                   'LCD',                                   '190','0', 'Waiting for Parts',      '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:07:58'),
    ('78680','63',3,'Samsung glaxy a21s',           'LCD',                                   '60', '0', 'Waiting for Parts',      '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:09:52'),
    ('78681','64',3,'pixel 7',                      'lcd',                                   '150','0', 'Waiting for Parts',      '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:11:41'),
    ('78682','65',3,'Samsung note 20 ultra',        'Charging',                              '1',  '0', 'Repaired',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:15:00'),
    ('78683','66',3,'15 pro',                       'Body & LCD',                            '250','0', 'Repaired',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:16:30'),
    ('78684','67',3,'i phone 12',                   'lcd',                                   '100','0', 'Received',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:19:22'),
    ('78685','68',3,'airpods',                      'battery',                               '40', '0', 'Repaired',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:23:59'),
    ('78686','69',3,'lenovo thinkbook',             'Charging point',                        '1',  '0', 'Repaired',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:26:58'),
    ('78687','70',3,'Lenovo chromebook',            'Display ic',                            '1',  '0', 'Repaired',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:29:05'),
    ('78688','46',3,'dell 7420',                    'Charging ic',                           '1',  '0', 'Repaired',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:31:19'),
    ('78689','26',3,'dell inspiron',                'charging point',                        '1',  '0', 'Repaired',               '',         '2026-03-23', '',                      '',                                                     '2026-03-23 16:34:03'),
    ('78690','71',3,'macbook A2337',                'rechecking',                            '1',  '0', 'In Progress',            '',         '2026-03-23', '',                      '',                                                     '2026-03-23 17:53:03'),
    ('78691','72',3,'pixel 4a 5g',                  'Water Damage',                          '40', '0', 'Received',               '',         '',           '',                      '',                                                     '2026-03-25 12:09:47'),
    ('78692','73',3,'flip 6',                       'lcd',                                   '320','100','In Progress',           '',         '2026-03-27', '',                      '',                                                     '2026-03-25 12:51:57'),
    ('78693','74',6,'s21 plus screen back iphone x','General Repair',                        '215','0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-31 11:41:14'),
    ('78694','75',6,'ipad pro 10.05',               'General Repair',                        '150','20','Collected',              '',         '',           '',                      '',                                                     '2026-03-31 15:05:19'),
    ('78695','76',6,'iphone 6s',                    'General Repair',                        '35', '0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-31 15:06:24'),
    ('78696','77',6,'iphone 13 red',                'General Repair',                        '200','0', 'Collected',              '',         '',           '',                      '',                                                     '2026-03-31 15:07:35'),
    ('78697','78',3,'huawei laptop',                'same charging port repair',              '70', '0', 'In Progress',            '',         '',           '',                      '',                                                     '2026-04-01 11:50:56'),
    ('78698','79',3,'iphone 15',                    'lcd, battery, rear glass',               '200','0', 'Received',               '',         '2026-04-01', '',                      '',                                                     '2026-04-01 15:02:09'),
    ('78699','80',3,'dodgee',                       'no power',                              '40', '0', 'Repaired',               '',         '2026-04-01', '',                      '',                                                     '2026-04-01 15:08:18'),
    ('78700','81',3,'macbook A2941',                'LCD',                                   '395','0', 'In Progress',            '',         '',           '',                      '',                                                     '2026-04-01 15:10:28'),
    ('78701','82',3,'PS5 CONTROLER',                'JOY STICK',                             '30', '0', 'Waiting for Parts',      '',         '',           '',                      '',                                                     '2026-04-01 15:11:35'),
    ('78702','83',3,'IPHONE 14',                    'FLASH',                                 '40', '0', 'Waiting for Parts',      '',         '',           '',                      '',                                                     '2026-04-01 15:13:13'),
    ('78703','84',3,'A1566',                        'Charging port, power button',           '45', '0', 'Repaired',               '',         '',           '',                      '',                                                     '2026-04-01 15:14:58'),
    ('78704','85',3,'iphone 12',                    'no service',                            '60', '0', 'Repaired',               '',         '',           '',                      '',                                                     '2026-04-01 15:20:10'),
    ('78705','86',3,'iphone 12 pro max',            'restarting',                            '60', '0', 'Waiting for Parts',      '',         '',           '',                      'battery replaced still cutting off',                   '2026-04-01 15:22:21'),
    ('78706','82',3,'asus laptop',                  'battery',                               '40', '0', 'Repaired',               '',         '',           '',                      '',                                                     '2026-04-01 15:26:08'),
    ('78707','59',5,'iphone',                       'Water Damage',                          '100','20','Received',               '263226',   '2026-04-28', 'we will do our best',   'be bold change the game',                              '2026-04-04 16:53:40'),
    ('78708','87',3,'iphone 13 pro max',            'rear glass, battery',                   '110','0', 'Received',               '',         '',           '',                      '',                                                     '2026-04-07 18:45:12'),
    ('78709','88',3,'IPHONE 13',                    'LCD, BATTERY',                          '130','0', 'In Progress',            '07711374682','',         '',                      '',                                                     '2026-04-14 13:11:02'),
    ('78710','89',6,'Google Pixel 10 PRO FOLD',     'Inner Lcd, Battery',                    '925','0', 'Repaired',               '',         '2026-04-15', '',                      '',                                                     '2026-04-15 15:56:59')
  ) AS r(ticket_no, cust_legacy_id, biz_id, device_model, issue,
         est_cost, deposit, status_name, imei, due_date, customer_note, staff_note, created_at)
  JOIN public.customers c ON c._legacy_id = r.cust_legacy_id
  JOIN _bm bm ON bm.biz_id = r.biz_id::int;
  END IF;

END $$;

-- ── Step 5: Clean up the temp column ───────────────────────────────
DROP INDEX IF EXISTS _cust_legacy_idx;
ALTER TABLE public.customers DROP COLUMN IF EXISTS _legacy_id;

-- ── Done ───────────────────────────────────────────────────────────
-- After running, verify with:
--   SELECT COUNT(*) FROM public.customers;  -- should show 60 new rows
--   SELECT COUNT(*) FROM public.repairs WHERE job_number LIKE '786%';  -- should show 64 rows
--
-- If any repairs show NULL customer_id, check the _legacy_id JOIN:
--   the repair's cust_legacy_id must match an inserted customer's old id.
