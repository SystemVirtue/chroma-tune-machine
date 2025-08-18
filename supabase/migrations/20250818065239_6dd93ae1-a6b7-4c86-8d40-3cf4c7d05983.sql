-- Create approved_users table for managing access
CREATE TABLE public.approved_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id) NULL,
  approved_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.approved_users ENABLE ROW LEVEL SECURITY;

-- Create policies for approved_users
CREATE POLICY "Super admins can manage all approved users" 
ON public.approved_users 
FOR ALL 
USING (has_role(auth.uid(), 'super_admin'::user_role));

CREATE POLICY "Tenant admins can view approved users in their tenant" 
ON public.approved_users 
FOR SELECT 
USING (
  has_role(auth.uid(), 'tenant_admin'::user_role) OR 
  has_role(auth.uid(), 'super_admin'::user_role)
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_approved_users_updated_at
BEFORE UPDATE ON public.approved_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to check if user email is approved
CREATE OR REPLACE FUNCTION public.is_email_approved(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approved_users
    WHERE email = _email
      AND status = 'approved'
  )
$$;

-- Update handle_new_user function to check approved status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = ''
AS $$
DECLARE
    tenant_record record;
    is_approved boolean;
BEGIN
    -- Check if email is approved
    SELECT public.is_email_approved(NEW.email) INTO is_approved;
    
    -- If not approved and not admin, reject signup
    IF NOT is_approved AND NEW.email NOT IN ('admin@djamms.app', 'testuser@djamms.app') THEN
        RAISE EXCEPTION 'Email address not approved for access. Please contact an administrator.';
    END IF;
    
    -- Get the tenant for testuser if the email matches
    IF NEW.email = 'testuser@djamms.app' THEN
        SELECT * INTO tenant_record FROM public.tenants WHERE subdomain = 'testuser' LIMIT 1;
    END IF;
    
    INSERT INTO public.user_profiles (user_id, email, full_name, role, tenant_id)
    VALUES (
        NEW.id, 
        NEW.email,
        NEW.raw_user_meta_data ->> 'full_name',
        CASE 
            WHEN NEW.email = 'admin@djamms.app' THEN 'super_admin'::user_role
            WHEN NEW.email = 'testuser@djamms.app' THEN 'tenant_admin'::user_role
            ELSE 'user'::user_role
        END,
        CASE 
            WHEN NEW.email = 'testuser@djamms.app' THEN tenant_record.id
            ELSE NULL
        END
    );
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't block user creation for admins
        IF NEW.email IN ('admin@djamms.app', 'testuser@djamms.app') THEN
            RAISE LOG 'Error in handle_new_user trigger: %', SQLERRM;
            RETURN NEW;
        ELSE
            -- Re-raise the exception to block signup
            RAISE;
        END IF;
END;
$$;