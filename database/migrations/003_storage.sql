-- Private storage bucket for report images. No public access; the backend uploads with the service role
-- and hands out short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-images', 'report-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
-- With RLS enabled on storage.objects and no policies for anon/authenticated, direct access is denied.
