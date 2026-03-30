INSERT INTO appliance_config (key, value) VALUES ('manager_code', '321abc')
ON CONFLICT (key) DO NOTHING;
