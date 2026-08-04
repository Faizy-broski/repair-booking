-- Migration 062: Auto-mark root thread unread when a reply is inserted
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: when a reply arrives for a thread the recipient has already read,
-- the root message's is_read stays TRUE so the conversation list shows no
-- unread indicator and the bell badge count is never incremented.
-- Fix: a AFTER INSERT trigger sets is_read = FALSE on the parent (root) row
-- whenever a child reply is written. The Supabase realtime UPDATE event that
-- fires as a result is picked up by MessageBadge and the messages page to
-- update the UI without a full page reload.

CREATE OR REPLACE FUNCTION messages_reply_mark_root_unread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on replies (parent_id IS NOT NULL).
  -- Only update when the root is currently read to avoid a no-op UPDATE that
  -- would still emit a realtime event and cause duplicate badge increments.
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE messages
    SET    is_read = FALSE
    WHERE  id      = NEW.parent_id
      AND  is_read = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop first so the migration is idempotent (safe to re-run).
DROP TRIGGER IF EXISTS messages_reply_unread_trigger ON messages;

CREATE TRIGGER messages_reply_unread_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_reply_mark_root_unread();
