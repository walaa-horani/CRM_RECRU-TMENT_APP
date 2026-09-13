-- 0009_storage_policies.sql
-- Resume storage.
--
-- Storage is a SEPARATE policy surface. Enabling RLS on public.candidates does
-- nothing whatsoever for the resume PDF sitting in object storage, and a missing
-- policy here leaks files while every table looks airtight.
--
-- Isolation rests entirely on the object key convention:
--     {tenant_id}/{candidate_id}/{filename}
-- The first path segment is the tenant. That key must always be built
-- server-side from the session -- never from a client-supplied filename, or a
-- caller can simply write `org_other/...` and walk out with it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,                                  -- private; served via signed URLs only
  10485760,                               -- 10 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do nothing;

create policy resumes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy resumes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy resumes_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy resumes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );
