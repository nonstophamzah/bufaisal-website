-- Fix: Admin is owner, not appliance manager
UPDATE appliance_workers SET role = 'owner', tab = 'OWNER' WHERE name = 'Admin';

-- Ensure manager code exists
INSERT INTO appliance_config (key, value) VALUES ('manager_code', '321abc')
ON CONFLICT (key) DO NOTHING;
