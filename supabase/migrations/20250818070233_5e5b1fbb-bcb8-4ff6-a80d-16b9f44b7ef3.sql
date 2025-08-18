-- Insert some pre-approved users into the approved_users table
INSERT INTO public.approved_users (email, status, approved_at) VALUES
  ('admin@djamms.app', 'approved', now()),
  ('testuser@djamms.app', 'approved', now()),
  ('demo@djamms.app', 'approved', now()),
  ('user1@djamms.app', 'approved', now()),
  ('user2@djamms.app', 'approved', now())
ON CONFLICT (email) DO UPDATE SET 
  status = 'approved',
  approved_at = now();