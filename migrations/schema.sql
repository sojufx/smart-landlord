CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','owner','staff','accountant','viewer')),
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landlords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_legal_name TEXT NOT NULL,
  trading_name TEXT,
  correspondence_address TEXT,
  phone TEXT,
  email TEXT,
  company_number TEXT,
  tax_reference TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_sort_code TEXT,
  bank_account_number TEXT,
  ownership_share NUMERIC(5,2) DEFAULT 100,
  solicitor_details TEXT,
  accountant_details TEXT,
  emergency_contact TEXT,
  rsw_registration_number TEXT,
  rsw_registration_start DATE,
  rsw_registration_expiry DATE,
  rsw_licence_number TEXT,
  rsw_licence_type TEXT,
  rsw_licence_expiry DATE,
  training_completed TEXT,
  cpd_notes TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id UUID REFERENCES landlords(id) ON DELETE SET NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  local_authority TEXT,
  property_type TEXT,
  bedrooms INTEGER DEFAULT 1,
  bathrooms INTEGER DEFAULT 1,
  max_occupants INTEGER,
  furnishing TEXT,
  construction_type TEXT,
  year_built INTEGER,
  council_tax_band TEXT,
  hmo_status TEXT DEFAULT 'not_applicable',
  hmo_licence_number TEXT,
  hmo_licence_expiry DATE,
  additional_licence_info TEXT,
  parking BOOLEAN DEFAULT false,
  garden BOOLEAN DEFAULT false,
  garage BOOLEAN DEFAULT false,
  keys_access TEXT,
  purchase_date DATE,
  purchase_price NUMERIC(12,2),
  mortgage_lender TEXT,
  mortgage_account TEXT,
  mortgage_interest_rate NUMERIC(6,3),
  insurance_provider TEXT,
  insurance_policy_number TEXT,
  insurance_expiry DATE,
  status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('occupied','vacant','notice','works','sold')),
  photo_url TEXT,
  floor_plan_url TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  surname TEXT NOT NULL,
  date_of_birth DATE,
  current_address TEXT,
  previous_address TEXT,
  mobile TEXT,
  email TEXT,
  emergency_contact_name TEXT,
  emergency_contact_relationship TEXT,
  emergency_contact_phone TEXT,
  guarantor_name TEXT,
  guarantor_address TEXT,
  guarantor_phone TEXT,
  guarantor_email TEXT,
  tenant_reference TEXT,
  occupants TEXT,
  dependants TEXT,
  pets TEXT,
  vehicles TEXT,
  application_date DATE,
  referencing_status TEXT,
  reference_result TEXT,
  previous_landlord_reference TEXT,
  employment_details TEXT,
  annual_income NUMERIC(12,2),
  credit_check_result TEXT,
  right_to_rent_check DATE,
  right_to_rent_result TEXT,
  id_document_url TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT UNIQUE NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  landlord_id UUID REFERENCES landlords(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  occupation_date DATE,
  end_date DATE,
  contract_type TEXT DEFAULT 'periodic' CHECK (contract_type IN ('fixed','periodic')),
  fixed_end_date DATE,
  rent_amount NUMERIC(10,2) NOT NULL,
  rent_frequency TEXT DEFAULT 'monthly' CHECK (rent_frequency IN ('weekly','fortnightly','monthly','quarterly')),
  rent_due_day INTEGER DEFAULT 1,
  holding_deposit NUMERIC(10,2),
  written_statement_sent DATE,
  written_statement_signed DATE,
  additional_terms TEXT,
  pets_allowed BOOLEAN DEFAULT false,
  utilities_responsibility TEXT,
  council_tax_responsibility TEXT,
  garden_responsibility TEXT,
  repairs_responsibility TEXT,
  termination_reason TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','ended','notice')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  date_received DATE,
  scheme TEXT CHECK (scheme IN ('DPS','TDS','MyDeposits','other')),
  scheme_reference TEXT,
  date_protected DATE,
  protection_deadline DATE,
  prescribed_information_sent DATE,
  acknowledgement_received BOOLEAN DEFAULT false,
  certificate_url TEXT,
  deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
  dispute_status TEXT,
  dispute_outcome TEXT,
  returned_amount NUMERIC(10,2),
  return_date DATE,
  status TEXT DEFAULT 'protected',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('gas','eicr','epc','insurance','rsw_registration','rsw_licence','hmo_licence','legionella','fire_risk','other')),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('not_applicable','pending','current','remedial','expired')),
  inspection_date DATE,
  expiry_date DATE,
  next_review_date DATE,
  provider_engineer TEXT,
  credential_number TEXT,
  certificate_number TEXT,
  rating TEXT,
  findings TEXT,
  control_measures TEXT,
  remedial_required BOOLEAN DEFAULT false,
  remedial_completed_date DATE,
  document_url TEXT,
  reminder_days INTEGER[] DEFAULT '{90,30}',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL CHECK (device_type IN ('smoke_alarm','carbon_monoxide_alarm')),
  location TEXT NOT NULL,
  alarm_type TEXT,
  associated_appliance TEXT,
  installation_date DATE,
  last_test_date DATE,
  test_result TEXT,
  battery_status TEXT,
  replacement_due DATE,
  contractor TEXT,
  photo_url TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  trade TEXT,
  public_liability_insurer TEXT,
  public_liability_expiry DATE,
  gas_safe_number TEXT,
  gas_safe_expiry DATE,
  electrical_qualification TEXT,
  other_qualifications TEXT,
  certificates_url TEXT,
  preferred BOOLEAN DEFAULT false,
  hourly_rate NUMERIC(8,2),
  day_rate NUMERIC(10,2),
  bank_details TEXT,
  score INTEGER,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_number TEXT UNIQUE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
  date_reported TIMESTAMPTZ NOT NULL DEFAULT now(),
  problem TEXT NOT NULL,
  category TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('emergency','high','normal','low')),
  status TEXT DEFAULT 'reported' CHECK (status IN ('reported','assigned','quoted','approved','scheduled','in_progress','completed','invoiced','closed')),
  quote_amount NUMERIC(10,2),
  approved_by TEXT,
  appointment_at TIMESTAMPTZ,
  access_arrangements TEXT,
  completed_date DATE,
  invoice_amount NUMERIC(10,2),
  invoice_url TEXT,
  tenant_notified BOOLEAN DEFAULT false,
  landlord_notified BOOLEAN DEFAULT true,
  warranty_until DATE,
  follow_up_date DATE,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  inspection_date DATE NOT NULL,
  inspector TEXT,
  general_condition TEXT,
  damp_mould TEXT,
  windows_doors TEXT,
  heating TEXT,
  plumbing TEXT,
  electrical TEXT,
  smoke_alarms TEXT,
  co_alarms TEXT,
  garden_external TEXT,
  repairs_required TEXT,
  priority TEXT DEFAULT 'normal',
  tenant_comments TEXT,
  follow_up_date DATE,
  report_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  inventory_type TEXT NOT NULL DEFAULT 'check_in' CHECK (inventory_type IN ('check_in','check_out','interim')),
  inventory_date DATE NOT NULL,
  inspector TEXT,
  tenant_present TEXT,
  room_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  meter_readings JSONB NOT NULL DEFAULT '{}'::jsonb,
  keys_count INTEGER,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  tenant_acknowledgement BOOLEAN DEFAULT false,
  signed_document_url TEXT,
  comparison_notes TEXT,
  estimated_costs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  amount_due NUMERIC(10,2) NOT NULL,
  amount_received NUMERIC(10,2) DEFAULT 0,
  payment_date DATE,
  payment_method TEXT,
  payment_reference TEXT,
  allocation_notes TEXT,
  status TEXT GENERATED ALWAYS AS (
    CASE WHEN amount_received >= amount_due THEN 'paid'
         WHEN amount_received > 0 THEN 'part_paid'
         ELSE 'arrears' END
  ) STORED,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE,
  invoice_type TEXT DEFAULT 'management_fee' CHECK (invoice_type IN ('management_fee','tenant_charge','contractor','maintenance','repair_recharge','deposit_statement','rent_statement','arrears_statement','landlord_monthly','landlord_annual','credit_note','refund','purchase','expense')),
  landlord_id UUID REFERENCES landlords(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_date DATE,
  customer_name TEXT NOT NULL,
  customer_address TEXT,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_reference TEXT,
  bank_details TEXT,
  notes TEXT,
  terms TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT GENERATED ALWAYS AS (
    CASE WHEN amount_paid >= total THEN 'paid'
         WHEN amount_paid > 0 THEN 'part_paid'
         ELSE 'outstanding' END
  ) STORED,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL,
  supplier TEXT,
  category TEXT,
  description TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  landlord_id UUID REFERENCES landlords(id) ON DELETE SET NULL,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(12,2) GENERATED ALWAYS AS (net_amount + vat_amount) STORED,
  receipt_url TEXT,
  payment_method TEXT,
  paid_by TEXT,
  rechargeable BOOLEAN DEFAULT false,
  tax_category TEXT,
  deductible_assumption TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  folder TEXT,
  document_type TEXT,
  issue_date DATE,
  expiry_date DATE,
  version TEXT,
  notes TEXT,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction TEXT CHECK (direction IN ('incoming','outgoing','internal')),
  channel TEXT CHECK (channel IN ('email','sms','letter','phone','whatsapp','portal','meeting','other')),
  subject TEXT,
  body TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  landlord_id UUID REFERENCES landlords(id) ON DELETE SET NULL,
  contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
  repair_id UUID REFERENCES repairs(id) ON DELETE SET NULL,
  participants TEXT,
  attachment_url TEXT,
  outcome TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_type TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  date_created DATE NOT NULL DEFAULT CURRENT_DATE,
  date_served DATE,
  service_method TEXT,
  recipient TEXT,
  document_url TEXT,
  proof_of_service TEXT,
  response TEXT,
  deadline DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','served','acknowledged','expired','withdrawn')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  reminder_key TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date DATE NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info','amber','red')),
  message TEXT,
  acknowledged BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_table, source_id, reminder_key)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  details TEXT,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('property_visit','maintenance','compliance','document','tenant_contact','rent','renovation','other')),
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  landlord_id UUID REFERENCES landlords(id) ON DELETE SET NULL,
  location TEXT,
  assigned_to TEXT,
  due_date DATE NOT NULL,
  due_time TIME WITHOUT TIME ZONE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','completed','cancelled')),
  completion_date DATE,
  completion_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  resource_table TEXT,
  resource_id UUID,
  ip_address TEXT,
  summary TEXT,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','landlords','properties','tenants','contracts','deposits','compliance_records','safety_devices','contractors','repairs','inspections','inventories','invoices','expenses','documents','notices'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_contracts_property ON contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_compliance_property ON compliance_records(property_id);
CREATE INDEX IF NOT EXISTS idx_compliance_expiry ON compliance_records(expiry_date);
CREATE INDEX IF NOT EXISTS idx_rent_due ON rent_payments(due_date, status);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status, priority);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_logs(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS utility_gas_supplier TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS utility_electricity_supplier TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS utility_water_supplier TEXT;
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS rsw_registration_certificate_url TEXT;
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS rsw_licence_certificate_url TEXT;

ALTER TABLE compliance_records DROP CONSTRAINT IF EXISTS compliance_records_category_check;
ALTER TABLE compliance_records ADD CONSTRAINT compliance_records_category_check
  CHECK (category IN ('gas','eicr','epc','insurance','rsw_registration','rsw_licence','hmo_licence','legionella','smoke_co_alarm','fire_detection_alarm_system','fire_risk','other'));
