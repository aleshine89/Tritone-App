create table if not exists push_keys (
  id integer primary key,
  public_key text not null,
  private_key text not null
);

create table if not exists push_devices (
  id serial primary key,
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
