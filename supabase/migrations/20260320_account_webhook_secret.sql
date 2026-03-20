-- Ajouter le secret webhook par compte Systeme.io
ALTER TABLE systemeio_accounts
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
