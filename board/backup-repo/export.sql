-- One snapshot of the Bristol FSAI Board, written as JSON files into the current directory.
-- Everything is read in one read-only, repeatable-read transaction, so all files show the same moment.
-- Run by backup.sh: psql -X -q -A -t -v ON_ERROR_STOP=1 -f export.sql

begin transaction isolation level repeatable read read only;

\o members.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.username)), '[]') from public.members t;

\o field_options.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.field, t.sort_order, t.name)), '[]') from public.field_options t;

\o items.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.number)), '[]') from public.items t;

\o activity.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.id)), '[]') from public.activity t;

\o board_settings.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t))), '[]') from public.board_settings t;

\o manifest.json
select jsonb_pretty(jsonb_build_object(
  'taken_at', now(),
  'counts', jsonb_build_object(
    'members', (select count(*) from public.members),
    'field_options', (select count(*) from public.field_options),
    'items', (select count(*) from public.items),
    'activity', (select count(*) from public.activity)
  )
));

\o
commit;
