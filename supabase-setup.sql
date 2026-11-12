-- ASTRÉLYS V0.5 : exécuter dans Supabase > SQL Editor.
-- ATTENTION : configurez les inscriptions et confirmez les emails avant de partager l'app.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(display_name) between 2 and 32),
 role text not null default 'player' check (role in ('player','mj'))
);
create or replace function public.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name,role) values (new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),32),''),'Joueur'), 'player');
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();
create table if not exists public.private_messages (
 id bigint generated always as identity primary key,
 sender_id uuid not null references public.profiles(id),
 recipient_id uuid not null references public.profiles(id),
 body text not null check (char_length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now(),
 check (sender_id <> recipient_id)
);
create index if not exists private_messages_participants on public.private_messages(sender_id,recipient_id,created_at);
create table if not exists public.constellation_messages (
 id bigint generated always as identity primary key,
 sender_id uuid not null references public.profiles(id),
 recipient_id uuid not null references public.profiles(id),
 constellation text not null check (char_length(constellation) between 1 and 80),
 body text not null check (char_length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index if not exists constellation_messages_recipient on public.constellation_messages(recipient_id,created_at);
alter table public.profiles enable row level security;
alter table public.private_messages enable row level security;
alter table public.constellation_messages enable row level security;
revoke all on public.profiles,public.private_messages,public.constellation_messages from anon;
grant select on public.profiles to authenticated;
grant select,insert on public.private_messages,public.constellation_messages to authenticated;
grant usage,select on all sequences in schema public to authenticated;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists dm_read on public.private_messages;
create policy dm_read on public.private_messages for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists dm_insert on public.private_messages;
create policy dm_insert on public.private_messages for insert to authenticated with check (auth.uid() = sender_id);
drop policy if exists constellation_read on public.constellation_messages;
create policy constellation_read on public.constellation_messages for select to authenticated using (auth.uid() = recipient_id or auth.uid() = sender_id);
drop policy if exists constellation_insert on public.constellation_messages;
create policy constellation_insert on public.constellation_messages for insert to authenticated with check (
 auth.uid() = sender_id and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='mj')
);
-- IMPORTANT : après inscription du MJ, attribuer son rôle MANUELLEMENT dans SQL Editor :
-- update public.profiles set role='mj' where id = 'UUID_DU_MJ';
-- Ne jamais mettre une clé service_role dans le dépôt GitHub public.
