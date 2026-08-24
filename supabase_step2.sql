-- My Gourmet Guide v2.0 - Supabase Step 2
-- Run this ONCE in SQL Editor after the first setup SQL succeeded.

-- 1) Share code
alter table public.gourmet_groups
  add column if not exists share_code text;

update public.gourmet_groups
set share_code = upper(substr(encode(gen_random_bytes(8),'hex'),1,8))
where share_code is null;

alter table public.gourmet_groups
  alter column share_code set default upper(substr(encode(gen_random_bytes(8),'hex'),1,8));

create unique index if not exists gourmet_groups_share_code_idx
  on public.gourmet_groups(share_code);

-- 2) Because "Automatically expose new tables" was disabled,
-- explicitly grant only the privileges the authenticated app needs.
grant usage on schema public to authenticated;

grant select, update, delete
  on public.gourmet_groups to authenticated;

grant select, insert, update, delete
  on public.gourmet_group_members to authenticated;

grant select, insert, update, delete
  on public.restaurants to authenticated;

grant select, insert, update, delete
  on public.restaurant_photos to authenticated;

grant execute on function public.create_gourmet_group(text)
  to authenticated;

-- 3) Join a group by share code.
create or replace function public.join_gourmet_group(join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select id into gid
  from public.gourmet_groups
  where upper(share_code) = upper(trim(join_code))
  limit 1;

  if gid is null then
    raise exception '共有コードが見つかりません';
  end if;

  insert into public.gourmet_group_members(group_id,user_id,role)
  values(gid,auth.uid(),'member')
  on conflict(group_id,user_id) do nothing;

  return gid;
end;
$$;

grant execute on function public.join_gourmet_group(text)
  to authenticated;

-- 4) Make sure RLS remains enabled.
alter table public.gourmet_groups enable row level security;
alter table public.gourmet_group_members enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_photos enable row level security;
