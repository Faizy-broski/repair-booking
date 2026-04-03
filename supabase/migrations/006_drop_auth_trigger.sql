-- ============================================================
-- 006_drop_auth_trigger.sql
-- Remove the auto-profile trigger on auth.users.
-- Profile rows are now created explicitly in the application
-- (AuthService.register → profiles upsert) to avoid permission
-- issues when GoTrue executes the trigger function.
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
