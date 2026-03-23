-- Add product configuration columns to webinars table
ALTER TABLE webinars
  ADD COLUMN IF NOT EXISTS main_product_name TEXT,
  ADD COLUMN IF NOT EXISTS main_product_price INTEGER, -- en centimes
  ADD COLUMN IF NOT EXISTS main_product_payments INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS main_product_installment_price INTEGER; -- en centimes
