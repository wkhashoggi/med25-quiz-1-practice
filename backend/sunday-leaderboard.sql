-- Saudi leaderboard week: Sunday 00:00 to the following Sunday 00:00, Asia/Riyadh.
-- Existing attempt XP, bonus XP, all-time totals, month totals and streaks are preserved.
lock table public.game_attempts, public.game_xp_events, public.game_profiles in share row exclusive mode;

create temporary table sunday_week_before on commit drop as
select user_id,points,monthly_xp,month_start,current_streak,best_streak
from public.game_profiles;

CREATE OR REPLACE FUNCTION private.apply_bonus_xp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_week date := ((now() at time zone 'Asia/Riyadh')::date - extract(dow from now() at time zone 'Asia/Riyadh')::integer);
 v_month date := (date_trunc('month',now() at time zone 'Asia/Riyadh'))::date;
begin
 update public.game_profiles
 set points=points+new.xp,
     weekly_xp=case when week_start=v_week then weekly_xp else 0 end+new.xp,
     monthly_xp=case when month_start=v_month then monthly_xp else 0 end+new.xp,
     week_start=v_week,month_start=v_month,updated_at=now()
 where user_id=new.user_id;
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION private.apply_game_attempt_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base integer;
  v_streak integer;
  v_multiplier numeric;
  v_delta integer;
  v_week date := ((now() at time zone 'Asia/Riyadh')::date - extract(dow from now() at time zone 'Asia/Riyadh')::integer);
  v_month date := (date_trunc('month', now() at time zone 'Asia/Riyadh'))::date;
begin
  insert into public.game_profiles(user_id, username)
  values (new.user_id,'med25_' || substring(replace(new.user_id::text,'-','') from 1 for 10))
  on conflict (user_id) do nothing;

  select case when new.correct then current_streak + 1 else 0 end
  into v_streak from public.game_profiles where user_id=new.user_id for update;

  if new.correct then
    v_base := case when new.source='past' then 7 else 5 end;
    v_multiplier := case
      when v_streak >= 30 then 2.0
      when v_streak >= 20 then 1.5
      when v_streak >= 10 then 1.25
      when v_streak >= 5 then 1.10
      else 1.0 end;
    v_delta := round(v_base * v_multiplier);
  else
    v_delta := 1;
  end if;

  update public.game_attempts set points_delta=v_delta where id=new.id;

  update public.game_profiles
  set points = points + v_delta,
      correct_first_attempts = correct_first_attempts + case when new.correct then 1 else 0 end,
      wrong_first_attempts = wrong_first_attempts + case when new.correct then 0 else 1 end,
      current_streak = v_streak,
      best_streak = greatest(best_streak,v_streak),
      weekly_xp = case when week_start=v_week then weekly_xp else 0 end + v_delta,
      monthly_xp = case when month_start=v_month then monthly_xp else 0 end + v_delta,
      week_start=v_week,
      month_start=v_month,
      updated_at=now()
  where user_id=new.user_id;
  return new;
end;
$function$;

alter table public.game_profiles alter column week_start set default ((now() at time zone 'Asia/Riyadh')::date - extract(dow from now() at time zone 'Asia/Riyadh')::integer);

with period as (
  select ((now() at time zone 'Asia/Riyadh')::date - extract(dow from now() at time zone 'Asia/Riyadh')::integer) as starts
), earned as (
  select user_id,sum(xp)::bigint as xp
  from (
    select a.user_id,a.points_delta as xp from public.game_attempts a cross join period w
    where a.created_at >= (w.starts::timestamp at time zone 'Asia/Riyadh')
      and a.created_at < ((w.starts+7)::timestamp at time zone 'Asia/Riyadh')
    union all
    select e.user_id,e.xp from public.game_xp_events e cross join period w
    where e.created_at >= (w.starts::timestamp at time zone 'Asia/Riyadh')
      and e.created_at < ((w.starts+7)::timestamp at time zone 'Asia/Riyadh')
  ) recorded
  group by user_id
)
update public.game_profiles p
set weekly_xp=coalesce((select xp from earned e where e.user_id=p.user_id),0),
    week_start=w.starts
from period w;

do $check$
begin
  if exists(
    select 1 from sunday_week_before b full join public.game_profiles p using(user_id)
    where b.user_id is null or p.user_id is null or
      row(b.points,b.monthly_xp,b.month_start,b.current_streak,b.best_streak)
      is distinct from row(p.points,p.monthly_xp,p.month_start,p.current_streak,p.best_streak)
  ) then raise exception 'Sunday migration unexpectedly changed nonweekly profile data'; end if;
  if exists(
    select 1 from public.game_profiles p left join public.leaderboard_entries l using(user_id)
    where l.user_id is null or l.week_start is distinct from p.week_start or l.weekly_xp is distinct from p.weekly_xp
  ) then raise exception 'Leaderboard weekly totals did not synchronize'; end if;
end;
$check$;

