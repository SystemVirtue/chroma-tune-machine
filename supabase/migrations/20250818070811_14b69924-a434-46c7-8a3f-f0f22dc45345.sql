-- Drop and recreate the trigger to fix any issues
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    tenant_record record;
    is_approved boolean := false;
BEGIN
    -- Log the signup attempt
    RAISE LOG 'New user signup attempt: %', NEW.email;
    
    -- Check if email is approved (with explicit cast to ensure proper comparison)
    SELECT public.is_email_approved(LOWER(TRIM(NEW.email))) INTO is_approved;
    
    RAISE LOG 'Email approval check for %: %', NEW.email, is_approved;
    
    -- Always allow admin emails, or check approval status
    IF NEW.email IN ('admin@djamms.app', 'testuser@djamms.app') OR is_approved = true THEN
        RAISE LOG 'User % is approved, proceeding with profile creation', NEW.email;
        
        -- Get the tenant for testuser if the email matches
        IF NEW.email = 'testuser@djamms.app' THEN
            SELECT * INTO tenant_record FROM public.tenants WHERE subdomain = 'testuser' LIMIT 1;
        END IF;
        
        -- Create user profile
        INSERT INTO public.user_profiles (user_id, email, full_name, role, tenant_id)
        VALUES (
            NEW.id, 
            NEW.email,
            COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
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
        
        RAISE LOG 'User profile created successfully for %', NEW.email;
        
    ELSE
        RAISE LOG 'Email % is not approved for access', NEW.email;
        RAISE EXCEPTION 'Email address not approved for access. Please contact an administrator.';
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in handle_new_user trigger for %: %', NEW.email, SQLERRM;
        -- Re-raise the exception to block signup for unapproved users
        RAISE;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();