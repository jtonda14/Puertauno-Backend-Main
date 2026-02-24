-- Migration: Create expense management tables
-- Run this script in Supabase SQL Editor

-- 1. Expense Categories (configurable by user)
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT expense_categories_pkey PRIMARY KEY (id),
  CONSTRAINT expense_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for expense_categories
CREATE POLICY "Users can view their own expense categories"
  ON public.expense_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expense categories"
  ON public.expense_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expense categories"
  ON public.expense_categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expense categories"
  ON public.expense_categories FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Billing Companies (for invoice data)
CREATE TABLE IF NOT EXISTS public.billing_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_name text NOT NULL,
  tax_id text,
  address text,
  city text,
  postal_code text,
  country text,
  email text,
  phone text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT billing_companies_pkey PRIMARY KEY (id),
  CONSTRAINT billing_companies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Enable RLS
ALTER TABLE public.billing_companies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for billing_companies
CREATE POLICY "Users can view their own billing companies"
  ON public.billing_companies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own billing companies"
  ON public.billing_companies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own billing companies"
  ON public.billing_companies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own billing companies"
  ON public.billing_companies FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Expense Accounts (one per reservation)
CREATE TABLE IF NOT EXISTS public.expense_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  accommodation_request_id uuid NOT NULL UNIQUE,
  guest_id uuid,
  billing_company_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'cancelled')),
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  paid_amount numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  settled_at timestamp with time zone,
  CONSTRAINT expense_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT expense_accounts_request_fkey FOREIGN KEY (accommodation_request_id) REFERENCES public.accommodation_requests(id) ON DELETE CASCADE,
  CONSTRAINT expense_accounts_guest_fkey FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE SET NULL,
  CONSTRAINT expense_accounts_company_fkey FOREIGN KEY (billing_company_id) REFERENCES public.billing_companies(id) ON DELETE SET NULL,
  CONSTRAINT expense_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Enable RLS
ALTER TABLE public.expense_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for expense_accounts
CREATE POLICY "Users can view their own expense accounts"
  ON public.expense_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expense accounts"
  ON public.expense_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expense accounts"
  ON public.expense_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expense accounts"
  ON public.expense_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Expense Items (individual charges)
CREATE TABLE IF NOT EXISTS public.expense_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  expense_account_id uuid NOT NULL,
  category_id uuid,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL,
  date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT expense_items_pkey PRIMARY KEY (id),
  CONSTRAINT expense_items_account_fkey FOREIGN KEY (expense_account_id) REFERENCES public.expense_accounts(id) ON DELETE CASCADE,
  CONSTRAINT expense_items_category_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  CONSTRAINT expense_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Enable RLS
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for expense_items
CREATE POLICY "Users can view their own expense items"
  ON public.expense_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expense items"
  ON public.expense_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expense items"
  ON public.expense_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expense items"
  ON public.expense_items FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Expense Payments (partial/full payments)
CREATE TABLE IF NOT EXISTS public.expense_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  expense_account_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
  payment_method_detail text,
  reference text,
  payment_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT expense_payments_pkey PRIMARY KEY (id),
  CONSTRAINT expense_payments_account_fkey FOREIGN KEY (expense_account_id) REFERENCES public.expense_accounts(id) ON DELETE CASCADE,
  CONSTRAINT expense_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Enable RLS
ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for expense_payments
CREATE POLICY "Users can view their own expense payments"
  ON public.expense_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expense payments"
  ON public.expense_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expense payments"
  ON public.expense_payments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expense payments"
  ON public.expense_payments FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expense_accounts_request ON public.expense_accounts(accommodation_request_id);
CREATE INDEX IF NOT EXISTS idx_expense_accounts_guest ON public.expense_accounts(guest_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_account ON public.expense_items(expense_account_id);
CREATE INDEX IF NOT EXISTS idx_expense_payments_account ON public.expense_payments(expense_account_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_user ON public.expense_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_companies_user ON public.billing_companies(user_id);


