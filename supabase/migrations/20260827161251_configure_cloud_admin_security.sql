INSERT INTO public.settings(key,value) VALUES
('admin_password_salt','5ea4cb9a7d3b95a457ce835ce0ca4bf9'),
('admin_password_hash','05f553f78cd688a9a3928a46a44e70ea91d98d6f0bd5ad10a3e0f87d117e6c98'),
('session_secret','588df9b0e92aace8a362b1a26436692e91f6d12069d58d3c4a65fa2f985e07c7')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;;
