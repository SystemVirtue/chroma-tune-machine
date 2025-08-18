-- Fix search path security warnings by setting search_path on functions
CREATE OR REPLACE FUNCTION public.check_rate_limit(_api_key text, _endpoint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _api_user RECORD;
  _current_usage INTEGER;
BEGIN
  -- Get API user info
  SELECT * INTO _api_user 
  FROM public.api_users 
  WHERE api_key = _api_key AND is_active = true;
  
  IF _api_user IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check current usage in the window
  SELECT COALESCE(SUM(request_count), 0) INTO _current_usage
  FROM public.api_usage
  WHERE api_user_id = _api_user.id
    AND date_hour >= now() - interval '1 hour' * (_api_user.rate_limit_window / 3600.0);
  
  -- Update last used
  UPDATE public.api_users 
  SET last_used_at = now() 
  WHERE id = _api_user.id;
  
  RETURN _current_usage < _api_user.rate_limit_requests;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role user_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.user_profiles
  WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.log_api_usage(_api_key text, _endpoint text, _method text, _status integer DEFAULT NULL::integer, _processing_time_ms integer DEFAULT NULL::integer, _request_size_bytes integer DEFAULT NULL::integer, _response_size_bytes integer DEFAULT NULL::integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _api_user_id UUID;
BEGIN
  -- Get API user ID
  SELECT id INTO _api_user_id 
  FROM public.api_users 
  WHERE api_key = _api_key;
  
  IF _api_user_id IS NOT NULL THEN
    INSERT INTO public.api_usage (
      api_user_id, endpoint, method, response_status, 
      processing_time_ms, request_size_bytes, response_size_bytes
    ) VALUES (
      _api_user_id, _endpoint, _method, _status,
      _processing_time_ms, _request_size_bytes, _response_size_bytes
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_email_approved(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approved_users
    WHERE email = _email
      AND status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
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