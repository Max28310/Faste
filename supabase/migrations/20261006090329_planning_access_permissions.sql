-- Remove inherited default privileges: RLS does not protect TRUNCATE.
revoke all on public.event_quote_plans,public.event_team_members,public.event_resource_bookings from public,anon,authenticated;
grant select,insert,update on public.event_quote_plans,public.event_team_members,public.event_resource_bookings to authenticated;
