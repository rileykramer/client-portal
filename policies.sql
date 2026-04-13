alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.credentials_requests enable row level security;
alter table public.uploads enable row level security;
alter table public.messages enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "Users can read own projects"
on public.projects for select
using (client_id = auth.uid());

create policy "Users can read tasks for own projects"
on public.tasks for select
using (
  exists (
    select 1 from public.projects p
    where p.id = tasks.project_id
      and p.client_id = auth.uid()
  )
);

create policy "Users can insert uploads for own projects"
on public.uploads for insert
with check (
  exists (
    select 1 from public.projects p
    where p.id = uploads.project_id
      and p.client_id = auth.uid()
  )
);

create policy "Users can read uploads for own projects"
on public.uploads for select
using (
  exists (
    select 1 from public.projects p
    where p.id = uploads.project_id
      and p.client_id = auth.uid()
  )
);

create policy "Users can read messages for own projects"
on public.messages for select
using (
  exists (
    select 1 from public.projects p
    where p.id = messages.project_id
      and p.client_id = auth.uid()
  )
);

create policy "Users can insert messages for own projects"
on public.messages for insert
with check (
  exists (
    select 1 from public.projects p
    where p.id = messages.project_id
      and p.client_id = auth.uid()
  )
);

create policy "Users can upload own files"
on storage.objects for insert
with check (
  bucket_id = 'client-uploads'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can read own files"
on storage.objects for select
using (
  bucket_id = 'client-uploads'
  and auth.uid()::text = (storage.foldername(name))[1]
);
