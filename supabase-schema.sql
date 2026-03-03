-- Run this in the Supabase SQL Editor to set up the database schema.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_text text,
  status text not null default 'active',  -- 'active' | 'complete'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,     -- 'tutor' | 'student'
  type text not null,     -- 'narration' | 'guided_question' | 'guided_answer' | 'student_message' | 'conversational_reply'
  content text not null,
  created_at timestamptz not null default now()
);

create table public.agent_states (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  messages_json jsonb not null,
  solver_result_json jsonb,
  updated_at timestamptz not null default now(),
  constraint agent_states_conversation_id_key unique (conversation_id)
);

-- RLS: users see only their own data
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.agent_states enable row level security;

create policy "Users see own conversations" on public.conversations
  for all using (auth.uid() = user_id);
create policy "Users see own messages" on public.messages
  for all using (conversation_id in (select id from public.conversations where user_id = auth.uid()));
create policy "Users see own agent states" on public.agent_states
  for all using (conversation_id in (select id from public.conversations where user_id = auth.uid()));
