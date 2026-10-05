-- Billi database: tables, security rules and functions.
-- This is exactly what is applied to the Supabase project. To set up a new project, paste the whole file into the SQL editor and run it once.
-- Every object is prefixed billi_ so it can share a project with another app without touching that app's tables.

create table public.billi_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 40),
  gate_paper text check (gate_paper is null or char_length(gate_paper) <= 8),
  gate_exam_date date not null default date '2027-02-06',
  gate_min int not null default 120 check (gate_min between 15 and 600),
  gate_max int not null default 180 check (gate_max between 15 and 720),
  lead_min int not null default 5 check (lead_min between 0 and 60),
  sound boolean not null default true,
  created_at timestamptz not null default now(),
  check (gate_max >= gate_min)
);

create table public.billi_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index billi_classes_owner on public.billi_classes (owner);

create table public.billi_class_members (
  class_id uuid not null references public.billi_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index billi_class_members_user on public.billi_class_members (user_id);

-- A slot belongs either to a class (class_id) or to one person (user_id), never both.
create table public.billi_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.billi_classes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 60),
  room text not null default '' check (char_length(room) <= 40),
  day smallint not null check (day between 1 and 7),          -- 1 = Monday ... 7 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((class_id is null) <> (user_id is null))
);
create index billi_slots_class on public.billi_slots (class_id, day, start_time);
create index billi_slots_user on public.billi_slots (user_id, day, start_time);

-- "This class is cancelled on this date."
create table public.billi_slot_skips (
  slot_id uuid not null references public.billi_slots(id) on delete cascade,
  on_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, on_date)
);
create index billi_slot_skips_by on public.billi_slot_skips (created_by);

create table public.billi_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  track text not null default 'personal' check (track in ('college','gate','personal')),
  due_date date not null,
  due_time time,
  duration_min int not null default 30 check (duration_min between 5 and 600),
  alarm boolean not null default false,
  strict boolean not null default false,                       -- solve a sum to stop the alarm
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index billi_tasks_user_date on public.billi_tasks (user_id, due_date);

create table public.billi_focus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid references public.billi_tasks(id) on delete set null,
  track text not null check (track in ('college','gate','personal')),
  day date not null,                                           -- the student's local date
  started_at timestamptz not null,
  seconds int not null check (seconds between 1 and 43200),
  created_at timestamptz not null default now()
);
create index billi_focus_user_day on public.billi_focus (user_id, day);
create index billi_focus_task on public.billi_focus (task_id);

-- ---------- helpers used by the security rules ----------
create function public.billi_is_member(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billi_class_members m where m.class_id = p_class and m.user_id = (select auth.uid()));
$$;

create function public.billi_is_owner(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billi_classes c where c.id = p_class and c.owner = (select auth.uid()));
$$;

create function public.billi_can_see_slot(p_slot uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billi_slots s where s.id = p_slot
    and (s.user_id = (select auth.uid()) or (s.class_id is not null and public.billi_is_member(s.class_id))));
$$;

create function public.billi_can_edit_slot(p_slot uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billi_slots s where s.id = p_slot
    and (s.user_id = (select auth.uid()) or (s.class_id is not null and public.billi_is_owner(s.class_id))));
$$;

-- ---------- class actions ----------
create function public.billi_create_class(p_name text) returns public.billi_classes
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_row public.billi_classes;
  v_try int := 0;
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     -- no I, O, 0 or 1: they get misread
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Give the class a name of up to 60 letters' using errcode = '22023';
  end if;
  if (select count(*) from public.billi_classes where owner = v_uid) >= 5 then
    raise exception 'You can own up to 5 classes' using errcode = 'P0001';
  end if;
  loop
    select string_agg(substr(v_alpha, 1 + (get_byte(u.b, i) % 32), 1), '' order by i) into v_code
      from (select uuid_send(gen_random_uuid()) as b) u, generate_series(0, 5) as i;
    begin
      insert into public.billi_classes (name, code, owner) values (btrim(p_name), v_code, v_uid) returning * into v_row;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 8 then raise; end if;
    end;
  end loop;
  insert into public.billi_class_members (class_id, user_id, role) values (v_row.id, v_uid, 'owner');
  return v_row;
end $$;

create function public.billi_join_class(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_class uuid;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select id into v_class from public.billi_classes where code = upper(btrim(coalesce(p_code, '')));
  if v_class is null then raise exception 'No class has that code' using errcode = 'P0001'; end if;
  if exists (select 1 from public.billi_class_members where class_id = v_class and user_id = v_uid) then return v_class; end if;
  if (select count(*) from public.billi_class_members where class_id = v_class) >= 300 then
    raise exception 'This class is full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.billi_class_members where user_id = v_uid) >= 10 then
    raise exception 'You can be in up to 10 classes' using errcode = 'P0001';
  end if;
  insert into public.billi_class_members (class_id, user_id, role) values (v_class, v_uid, 'member');
  return v_class;
end $$;

create function public.billi_class_roster(p_class uuid)
returns table (user_id uuid, name text, role text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(nullif(btrim(p.name), ''), 'Student'), m.role, m.joined_at
  from public.billi_class_members m
  left join public.billi_profiles p on p.id = m.user_id
  where m.class_id = p_class and public.billi_is_member(p_class)
  order by (m.role = 'owner') desc, m.joined_at;
$$;

-- keep timetables a sensible size
create function public.billi_slot_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.class_id is not null and (select count(*) from public.billi_slots where class_id = new.class_id) >= 120 then
    raise exception 'A class timetable can hold up to 120 slots' using errcode = 'P0001';
  end if;
  if new.user_id is not null and (select count(*) from public.billi_slots where user_id = new.user_id) >= 120 then
    raise exception 'A personal timetable can hold up to 120 slots' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger billi_slot_cap before insert on public.billi_slots for each row execute function public.billi_slot_cap();

-- ---------- security rules: every table is locked, then opened only as far as needed ----------
alter table public.billi_profiles enable row level security;
alter table public.billi_classes enable row level security;
alter table public.billi_class_members enable row level security;
alter table public.billi_slots enable row level security;
alter table public.billi_slot_skips enable row level security;
alter table public.billi_tasks enable row level security;
alter table public.billi_focus enable row level security;

create policy "own profile read" on public.billi_profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile insert" on public.billi_profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "own profile update" on public.billi_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read class" on public.billi_classes for select to authenticated using (public.billi_is_member(id));
create policy "owner renames class" on public.billi_classes for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "owner deletes class" on public.billi_classes for delete to authenticated using (owner = (select auth.uid()));

create policy "members read members" on public.billi_class_members for select to authenticated using (public.billi_is_member(class_id));
create policy "member leaves class" on public.billi_class_members for delete to authenticated using (user_id = (select auth.uid()) and role = 'member');

create policy "read own and class slots" on public.billi_slots for select to authenticated
  using (user_id = (select auth.uid()) or (class_id is not null and public.billi_is_member(class_id)));
create policy "add own and owned class slots" on public.billi_slots for insert to authenticated
  with check (user_id = (select auth.uid()) or (class_id is not null and public.billi_is_owner(class_id)));
create policy "edit own and owned class slots" on public.billi_slots for update to authenticated
  using (user_id = (select auth.uid()) or (class_id is not null and public.billi_is_owner(class_id)))
  with check (user_id = (select auth.uid()) or (class_id is not null and public.billi_is_owner(class_id)));
create policy "remove own and owned class slots" on public.billi_slots for delete to authenticated
  using (user_id = (select auth.uid()) or (class_id is not null and public.billi_is_owner(class_id)));

create policy "read skips for visible slots" on public.billi_slot_skips for select to authenticated using (public.billi_can_see_slot(slot_id));
create policy "add skips for editable slots" on public.billi_slot_skips for insert to authenticated
  with check (public.billi_can_edit_slot(slot_id) and created_by = (select auth.uid()));
create policy "remove skips for editable slots" on public.billi_slot_skips for delete to authenticated using (public.billi_can_edit_slot(slot_id));

create policy "own tasks" on public.billi_tasks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own focus read" on public.billi_focus for select to authenticated using (user_id = (select auth.uid()));
create policy "own focus insert" on public.billi_focus for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own focus delete" on public.billi_focus for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- grants: signed-in users only ----------
revoke all on public.billi_profiles, public.billi_classes, public.billi_class_members, public.billi_slots,
  public.billi_slot_skips, public.billi_tasks, public.billi_focus from anon, public;
revoke update on public.billi_classes from authenticated;
grant update (name) on public.billi_classes to authenticated;          -- the owner may rename, never change the code or owner
revoke insert, update on public.billi_class_members from authenticated; -- joining goes through billi_join_class only
revoke insert on public.billi_classes from authenticated;               -- creating goes through billi_create_class only
revoke update on public.billi_focus from authenticated;                 -- study minutes cannot be edited afterwards

revoke execute on function public.billi_is_member(uuid), public.billi_is_owner(uuid), public.billi_can_see_slot(uuid),
  public.billi_can_edit_slot(uuid), public.billi_create_class(text), public.billi_join_class(text),
  public.billi_class_roster(uuid), public.billi_slot_cap() from public, anon;
grant execute on function public.billi_is_member(uuid), public.billi_is_owner(uuid), public.billi_can_see_slot(uuid),
  public.billi_can_edit_slot(uuid), public.billi_create_class(text), public.billi_join_class(text),
  public.billi_class_roster(uuid) to authenticated;
revoke execute on function public.billi_slot_cap() from authenticated;  -- runs only as a trigger

-- ---------- GATE syllabus progress ----------
-- One row per topic a student has learned, with its place in the revision cycle (reviews after 1, 3, 7 and 21 days).
create table public.billi_gate_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic_id text not null check (topic_id ~ '^[A-Z]{2}:[0-9a-f]{8}$'),
  stage smallint not null default 1 check (stage between 1 and 5),      -- 1..4 = waiting for the 1, 3, 7, 21 day review; 5 = all reviews done
  learned_on date not null,
  next_review date,                                                      -- null once all reviews are done
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id),
  check ((stage = 5) = (next_review is null))
);
create index billi_gate_progress_due on public.billi_gate_progress (user_id, next_review);

alter table public.billi_gate_progress enable row level security;
create policy "own gate progress" on public.billi_gate_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.billi_gate_progress from anon, public;

-- Parts of a paper the student is not taking (for papers with a choice, like XE or AR), and the alarm sound they picked.
alter table public.billi_profiles
  add column gate_parts_off jsonb not null default '[]'::jsonb check (jsonb_typeof(gate_parts_off) = 'array' and pg_column_size(gate_parts_off) < 2000),
  add column ringtone text not null default 'meow' check (ringtone in ('meow','grumpy','kitten','bell'));

-- ---------- mock tests ----------
-- A finished mock: which official paper, the answers given, and the score against the official key.
create table public.billi_mocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  set_id text not null check (set_id ~ '^20[0-9]{2}:[A-Z0-9]{2,5}$'),
  paper text not null check (paper ~ '^[A-Z]{2}$'),
  started_at timestamptz not null,
  seconds int not null check (seconds between 0 and 14400),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 8000),
  score numeric(5,2) not null check (score between -40 and 100),
  max_marks smallint not null check (max_marks between 1 and 100),
  correct smallint not null check (correct between 0 and 65),
  wrong smallint not null check (wrong between 0 and 65),
  skipped smallint not null check (skipped between 0 and 65),
  created_at timestamptz not null default now()
);
create index billi_mocks_user on public.billi_mocks (user_id, created_at desc);
alter table public.billi_mocks enable row level security;
create policy "own mocks read" on public.billi_mocks for select to authenticated using (user_id = (select auth.uid()));
create policy "own mocks insert" on public.billi_mocks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own mocks delete" on public.billi_mocks for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.billi_mocks from anon, public;
revoke update on public.billi_mocks from authenticated;

-- ---------- Ask Billi daily limit ----------
-- How many questions each student has asked the AI today. Only the function below can change it.
create table public.billi_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.billi_ai_usage enable row level security;
revoke all on public.billi_ai_usage from anon, public, authenticated;

create function public.billi_ai_bump(p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  insert into public.billi_ai_usage (user_id, day, n) values (v_uid, (now() at time zone 'Asia/Kolkata')::date, 1)
    on conflict (user_id, day) do update set n = public.billi_ai_usage.n + 1
    returning n into v_n;
  return v_n <= least(greatest(p_limit, 1), 200);
end $$;
revoke execute on function public.billi_ai_bump(int) from public, anon;
grant execute on function public.billi_ai_bump(int) to authenticated;
