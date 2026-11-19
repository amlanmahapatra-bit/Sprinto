-- Sprinto Outreach Engine — core schema (resumable pipeline state + full evidence trail)
-- Postgres 17 (gen_random_uuid in core).

create table if not exists icp_config (
  version int primary key,
  params jsonb not null,
  sprinto_context_version text not null,
  note text,
  created_by uuid references auth.users (id),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
-- exactly one active config
create unique index if not exists icp_config_one_active on icp_config ((is_active)) where is_active;

create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('gl', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  icp_version int not null references icp_config (version),
  mode text not null default 'review' check (mode in ('review', 'auto')),
  source text not null check (source in ('paste', 'csv', 'discover', 'fixtures')),
  created_by uuid references auth.users (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  domain text not null,
  name text,
  stage text not null default 'queued',
  verdict text,
  score int,
  confidence numeric,
  loops_used int not null default 0,
  gates text[] not null default '{}',
  flags text[] not null default '{}',
  hold_reason text,
  error text,
  cost_usd numeric not null default 0,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (run_id, domain)
);
create index if not exists companies_run_stage on companies (run_id, stage);

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  url text not null,
  kind text,
  fetched_via text,
  http_status int,
  content_md text,
  content_hash text,
  storage_path text,
  iteration int not null default 0,
  fetched_at timestamptz not null default now()
);
create index if not exists pages_company on pages (company_id);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  criterion text,
  signal text,
  value jsonb,
  quote text,
  source_url text,
  source_kind text,
  iteration int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists evidence_company on evidence (company_id);

create table if not exists company_facts (
  company_id uuid primary key references companies (id) on delete cascade,
  facts jsonb,
  signals jsonb,
  model text,
  prompt_version text,
  updated_at timestamptz not null default now()
);

create table if not exists qualifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  iteration int not null,
  score int,
  confidence numeric,
  criterion_points jsonb,
  gates text[] not null default '{}',
  flags text[] not null default '{}',
  decision text,
  trace jsonb,
  created_at timestamptz not null default now()
);
create index if not exists qualifications_company on qualifications (company_id);

create table if not exists research_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  iteration int not null,
  tool text not null,
  args jsonb,
  result_summary text,
  new_evidence_ids uuid[] not null default '{}',
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists research_steps_company on research_steps (company_id);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  position text,
  seniority text,
  department text,
  persona text,
  tier int,
  hunter_confidence int,
  verification_status text,
  eligible boolean not null default false,
  rank int,
  selection_reason text,
  source text not null default 'hunter' check (source in ('hunter', 'manual')),
  is_selected boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contacts_company on contacts (company_id);

create table if not exists pain_points (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  contact_id uuid references contacts (id) on delete set null,
  code text not null,
  rank int,
  score int,
  rationale text,
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists pain_points_company on pain_points (company_id);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  contact_id uuid references contacts (id) on delete set null,
  version int not null default 1,
  subject text,
  body text,
  hook_evidence_id uuid,
  claim_ids text[] not null default '{}',
  pain_code text,
  validator jsonb,
  critic jsonb,
  status text not null default 'draft',
  prompt_version text,
  created_at timestamptz not null default now()
);
create index if not exists drafts_company on drafts (company_id);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts (id) on delete cascade,
  action text not null check (action in ('approve', 'edit_approve', 'reject')),
  final_subject text,
  final_body text,
  edit_ratio numeric,
  reason_category text,
  reason_text text,
  reviewer uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists reviews_draft on reviews (draft_id);

create table if not exists sends (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  draft_id uuid references drafts (id) on delete set null,
  to_address text not null,
  intended_address text,
  gmail_message_id text,
  gmail_thread_id text,
  status text not null default 'pending',
  error text,
  sent_at timestamptz,
  replied boolean not null default false,
  unique (run_id, company_id)
);

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references sends (id) on delete cascade,
  type text not null check (type in ('open', 'click')),
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists email_events_send on email_events (send_id);

create table if not exists llm_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies (id) on delete cascade,
  step text,
  model text,
  prompt_version text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  latency_ms int,
  cost_usd numeric not null default 0,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists llm_calls_company on llm_calls (company_id);

create table if not exists api_usage (
  provider text not null,
  period text not null,
  count int not null default 0,
  primary key (provider, period)
);
