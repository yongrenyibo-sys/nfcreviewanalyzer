-- Supabaseの「SQL Editor」に貼り付けて実行してください。
-- テーブルを3つ作成します: stores(店舗) / clicks(タップ記録) / review_snapshots(レビュー数の日次記録)

create extension if not exists "pgcrypto";

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_url text not null,
  place_id text,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table clicks (
  id bigserial primary key,
  store_id uuid not null references stores(id) on delete cascade,
  date date not null default current_date,
  ts timestamptz not null default now(),
  ua text
);
create index clicks_store_date_idx on clicks (store_id, date);

create table review_snapshots (
  id bigserial primary key,
  store_id uuid not null references stores(id) on delete cascade,
  date date not null,
  review_count int,
  rating numeric,
  ts timestamptz not null default now(),
  unique (store_id, date)
);
create index review_snapshots_store_date_idx on review_snapshots (store_id, date);

-- サーバー側は「service role キー」を使ってアクセスするため、
-- Row Level Security は有効のままで問題ありません(service roleはRLSを無視します)。
alter table stores enable row level security;
alter table clicks enable row level security;
alter table review_snapshots enable row level security;
