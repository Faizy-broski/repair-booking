-- Private bucket for server-generated PDFs (signed URLs only).
-- Compatible with all Supabase versions — only uses the base columns.
insert into storage.buckets (id, name, public)
values ('pdf-cache', 'pdf-cache', false)
on conflict (id) do nothing;
