-- ============================================================
-- 001_initial_schema.sql
-- Full schema for POS SaaS Platform
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANCY CORE
-- ============================================================

CREATE TABLE plans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  price_monthly           NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly            NUMERIC(10,2),
  max_branches            INT NOT NULL DEFAULT 1,
  max_users               INT NOT NULL DEFAULT 5,
  features                JSONB NOT NULL DEFAULT '[]',
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly  TEXT,
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE businesses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  subdomain    TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  address      TEXT,
  logo_url     TEXT,
  country      TEXT DEFAULT 'GB',
  currency     TEXT DEFAULT 'GBP',
  timezone     TEXT DEFAULT 'Europe/London',
  is_active    BOOLEAN DEFAULT TRUE,
  is_suspended BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id              UUID NOT NULL REFERENCES plans(id),
  stripe_sub_id        TEXT UNIQUE,
  stripe_customer_id   TEXT,
  status               TEXT NOT NULL DEFAULT 'trialing'
                         CHECK (status IN ('trialing','active','past_due','canceled','suspended')),
  billing_cycle        TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  trial_ends_at        TIMESTAMPTZ,
  canceled_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  is_main     BOOLEAN DEFAULT FALSE,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Extends Supabase auth.users
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id) ON DELETE SET NULL,
  role        TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('super_admin','business_owner','branch_manager','staff','cashier')),
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand_id      UUID REFERENCES brands(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  sku           TEXT,
  barcode       TEXT,
  cost_price    NUMERIC(10,2) DEFAULT 0,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  has_variants  BOOLEAN DEFAULT FALSE,
  is_service    BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  custom_fields JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sku           TEXT,
  barcode       TEXT,
  cost_price    NUMERIC(10,2),
  selling_price NUMERIC(10,2),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity        INT NOT NULL DEFAULT 0,
  low_stock_alert INT DEFAULT 5,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, product_id, variant_id)
);

CREATE TABLE stock_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id),
  variant_id   UUID REFERENCES product_variants(id),
  type         TEXT NOT NULL
                 CHECK (type IN ('sale','adjustment','repair_used','return','transfer','purchase')),
  quantity     INT NOT NULL,
  reference_id UUID,
  note         TEXT,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  notes         TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GIFT CARDS (defined before sales to allow FK)
-- ============================================================

CREATE TABLE gift_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code          TEXT NOT NULL UNIQUE,
  initial_value NUMERIC(10,2) NOT NULL,
  balance       NUMERIC(10,2) NOT NULL,
  customer_id   UUID REFERENCES customers(id),
  is_active     BOOLEAN DEFAULT TRUE,
  expires_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POS / SALES
-- ============================================================

CREATE TABLE sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers(id),
  cashier_id     UUID REFERENCES profiles(id),
  subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(10,2) DEFAULT 0,
  tax            NUMERIC(10,2) DEFAULT 0,
  total          NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash','card','voucher','gift_card','split')),
  payment_status TEXT NOT NULL DEFAULT 'paid'
                   CHECK (payment_status IN ('paid','refunded','partial')),
  gift_card_id   UUID REFERENCES gift_cards(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sale_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  name       TEXT NOT NULL,
  quantity   INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  discount   NUMERIC(10,2) DEFAULT 0,
  total      NUMERIC(10,2) NOT NULL
);

-- ============================================================
-- REPAIRS
-- ============================================================

CREATE TABLE repairs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers(id),
  assigned_to    UUID REFERENCES profiles(id),
  job_number     TEXT NOT NULL,
  device_type    TEXT,
  device_brand   TEXT,
  device_model   TEXT,
  serial_number  TEXT,
  issue          TEXT NOT NULL,
  diagnosis      TEXT,
  status         TEXT NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received','in_progress','waiting_parts','repaired','unrepairable','collected')),
  estimated_cost NUMERIC(10,2),
  actual_cost    NUMERIC(10,2),
  deposit_paid   NUMERIC(10,2) DEFAULT 0,
  notify_customer BOOLEAN DEFAULT TRUE,
  custom_fields  JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE repair_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id  UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  name       TEXT NOT NULL,
  quantity   INT NOT NULL DEFAULT 1,
  unit_cost  NUMERIC(10,2),
  unit_price NUMERIC(10,2)
);

CREATE TABLE repair_status_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id  UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  note       TEXT,
  changed_by UUID REFERENCES profiles(id),
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EXPENSES & SALARIES
-- ============================================================

CREATE TABLE expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES expense_categories(id),
  title        TEXT NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url  TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EMPLOYEES & TIME CLOCKS
-- ============================================================

CREATE TABLE employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles(id),
  first_name  TEXT NOT NULL,
  last_name   TEXT,
  email       TEXT,
  phone       TEXT,
  role        TEXT,
  hourly_rate NUMERIC(8,2),
  hire_date   DATE,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE salaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL,
  pay_date    DATE NOT NULL,
  pay_period  TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE time_clocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out     TIMESTAMPTZ,
  break_minutes INT DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================

CREATE TABLE appointments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  employee_id UUID REFERENCES employees(id),
  title       TEXT NOT NULL,
  description TEXT,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  status      TEXT DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','confirmed','cancelled','completed')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INTERNAL MESSAGING
-- ============================================================

CREATE TABLE messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_branch_id UUID REFERENCES branches(id),
  to_branch_id   UUID REFERENCES branches(id),
  sender_id      UUID NOT NULL REFERENCES profiles(id),
  subject        TEXT,
  body           TEXT NOT NULL,
  parent_id      UUID REFERENCES messages(id),
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- ============================================================

CREATE TABLE invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers(id),
  reference_type TEXT CHECK (reference_type IN ('sale','repair','custom')),
  reference_id   UUID,
  invoice_number TEXT NOT NULL,
  items          JSONB NOT NULL DEFAULT '[]',
  subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(10,2) DEFAULT 0,
  tax            NUMERIC(10,2) DEFAULT 0,
  total          NUMERIC(10,2) NOT NULL DEFAULT 0,
  status         TEXT DEFAULT 'issued' CHECK (status IN ('issued','paid','void')),
  issued_at      TIMESTAMPTZ DEFAULT NOW(),
  due_at         TIMESTAMPTZ,
  pdf_url        TEXT,
  notes          TEXT,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GOOGLE REVIEWS
-- ============================================================

CREATE TABLE google_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  review_id    TEXT UNIQUE,
  author_name  TEXT,
  rating       INT CHECK (rating BETWEEN 1 AND 5),
  text         TEXT,
  published_at TIMESTAMPTZ,
  fetched_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE google_review_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL UNIQUE REFERENCES branches(id) ON DELETE CASCADE,
  place_id    TEXT,
  api_key     TEXT,
  last_synced TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOM FIELDS & MODULE SETTINGS
-- ============================================================

CREATE TABLE custom_field_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  module      TEXT NOT NULL CHECK (module IN ('repair','product','customer','expense','appointment')),
  field_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL CHECK (field_type IN ('text','number','select','date','boolean','textarea','phone','email')),
  options     JSONB,
  is_required BOOLEAN DEFAULT FALSE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, module, field_key)
);

CREATE TABLE module_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module     TEXT NOT NULL,
  settings   JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, module)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_profiles_business ON profiles(business_id);
CREATE INDEX idx_profiles_branch ON profiles(branch_id);
CREATE INDEX idx_branches_business ON branches(business_id);
CREATE INDEX idx_products_business ON products(business_id);
CREATE INDEX idx_inventory_branch ON inventory(branch_id);
CREATE INDEX idx_sales_branch ON sales(branch_id);
CREATE INDEX idx_sales_created ON sales(created_at);
CREATE INDEX idx_repairs_branch ON repairs(branch_id);
CREATE INDEX idx_repairs_status ON repairs(status);
CREATE INDEX idx_repairs_created ON repairs(created_at);
CREATE INDEX idx_expenses_branch ON expenses(branch_id);
CREATE INDEX idx_messages_business ON messages(business_id);
CREATE INDEX idx_messages_to_branch ON messages(to_branch_id);
CREATE INDEX idx_customers_business ON customers(business_id);
CREATE INDEX idx_time_clocks_employee ON time_clocks(employee_id);
CREATE INDEX idx_stock_movements_branch ON stock_movements(branch_id);
CREATE INDEX idx_invoices_branch ON invoices(branch_id);
CREATE INDEX idx_appointments_branch ON appointments(branch_id);
CREATE INDEX idx_appointments_start ON appointments(start_time);
