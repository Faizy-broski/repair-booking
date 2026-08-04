-- Migration 063: Fix the reply-unread trigger to prevent self-notifications
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug in migration 062:
--   Thread example:  Main Branch  ──►  London Branch   (root, to_branch_id = London)
--   Bob (London) sends a reply:        from = London, to = Main
--   Old trigger: UPDATE root SET is_read = FALSE  — no from_branch check!
--   Root has to_branch_id = London (Bob's branch).
--   Bob's MessageBadge sees the UPDATE, fires "New Reply" for BOB HIMSELF. ❌
--
-- Fix: only mark root unread when the reply comes FROM a DIFFERENT branch
-- than the root's to_branch_id (i.e. skip self-replies).
-- Additionally, notify the ORIGINAL SENDER when the recipient replies back
-- by also checking replies addressed to the sender's branch separately
-- (handled client-side via MessageBadge INSERT handler, not the trigger).

CREATE OR REPLACE FUNCTION messages_reply_mark_root_unread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE messages
    SET    is_read = FALSE
    WHERE  id              = NEW.parent_id
      AND  is_read         = TRUE
      -- *** KEY FIX ***
      -- Only mark root unread when the reply arrives FROM a branch OTHER than
      -- the root's original recipient. This prevents the original recipient
      -- from getting a "New Reply" notification for their OWN sent reply.
      AND  to_branch_id   != NEW.from_branch_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-create trigger (function is replaced above, trigger name is unchanged)
DROP TRIGGER IF EXISTS messages_reply_unread_trigger ON messages;

CREATE TRIGGER messages_reply_unread_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_reply_mark_root_unread();

  