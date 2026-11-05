-- Bristol FSAI Board migration, 5 November 2026 (run once, after schema.sql):
--   * Priority uses Jira's levels: Highest, High, Medium, Low, Lowest.
--   * The fields Size, Difficulty level, Domain, Task force, Safety related, Work package, Reviewer
--     and Team lead are removed (subteam leads replace Team lead, see field_options.leads).
-- Apply with: node scripts/apply-schema.mjs supabase/migrations/2026-11-05-jira-priorities.sql

begin;

-- Old priorities -> Jira's.
update public.items
set extra = jsonb_set(extra, '{priority}', to_jsonb(case extra ->> 'priority'
  when 'Critical path' then 'High'
  when 'Normal' then 'Medium'
  when 'Stretch' then 'Low'
end))
where extra ->> 'priority' in ('Critical path', 'Normal', 'Stretch');

-- Drop the removed fields from items.
update public.items
set extra = extra - array['domain', 'difficulty', 'size', 'task_force', 'safety_related', 'work_package', 'reviewer', 'team_lead']
where extra ?| array['domain', 'difficulty', 'size', 'task_force', 'safety_related', 'work_package', 'reviewer', 'team_lead'];

-- Options: the removed fields and the old priorities go; Jira's priorities come in.
delete from public.field_options where field in ('domain', 'difficulty', 'size', 'task_force', 'safety_related');
delete from public.field_options where field = 'priority' and name in ('Critical path', 'Normal', 'Stretch');
insert into public.field_options (field, name, color, sort_order) values
  ('priority', 'Highest', 'RED', 1),
  ('priority', 'High', 'RED', 2),
  ('priority', 'Medium', 'ORANGE', 3),
  ('priority', 'Low', 'BLUE', 4),
  ('priority', 'Lowest', 'BLUE', 5)
on conflict (field, name) do nothing;

commit;
