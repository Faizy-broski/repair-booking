-- Migration 060: Enable Supabase Realtime for the messages table
-- Without this the postgres_changes subscription emits zero events,
-- making the chat appear to require a page reload for new messages.

-- 1. Add messages to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 2. REPLICA IDENTITY FULL is only required when filtering UPDATE/DELETE events
-- by column value. Our subscriptions use INSERT-only + client-side filtering,
-- so default replica identity (primary key) is sufficient.
-- Set it anyway so future UPDATE subscriptions (e.g. is_read changes) work too.
ALTER TABLE messages REPLICA IDENTITY FULL;
