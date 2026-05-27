create table if not exists user_totp (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_encrypted text not null,
  enrolled_at timestamptz default now(),
  last_used_at timestamptz,
  pending boolean default true
);

alter table user_totp enable row level security;

create policy "Users can read own TOTP record"
  on user_totp for select
  using (auth.uid() = user_id);

create policy "Service role full access"
  on user_totp for all
  using ((select auth.role()) = 'service_role');
