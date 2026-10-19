CREATE OR REPLACE FUNCTION public.get_admin_analytics()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
with
summary as (
  select
    min(a.occurred_at) as analytics_started_at,
    min(a.occurred_at) filter (
      where a.event_name in ('section_view','lecture_study')
    ) as sitewide_tracking_started_at,
    count(distinct a.visitor_id) as total_visitors,
    count(distinct a.session_id) as total_sessions,
    count(*) as total_events,
    count(*) filter (where a.event_name='page_view') as page_views,
    count(*) filter (where a.event_name='section_view') as section_views,
    count(*) filter (where a.event_name='question_answer') as questions_answered,
    count(*) filter (
      where a.event_name='question_answer'
        and coalesce(a.metadata->>'source','')='ai_generated'
    ) as ai_questions_answered,
    count(*) filter (
      where a.event_name='question_answer'
        and coalesce(a.metadata->>'source','')<>'ai_generated'
    ) as past_questions_answered,
    count(*) filter (where a.event_name='answer_reveal') as answer_reveals,
    count(*) filter (where a.event_name='source_open') as source_opens,
    count(*) filter (where a.event_name='lecture_study') as lecture_study_actions,
    count(distinct a.user_id) filter (where a.user_id is not null) as active_signed_in_users,
    count(distinct a.visitor_id) filter (
      where a.occurred_at >= date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
    ) as visitors_today,
    count(*) filter (
      where a.occurred_at >= date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
    ) as interactions_today,
    count(*) filter (
      where a.event_name='question_answer'
        and a.occurred_at >= date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
    ) as answers_today
  from public.analytics_events a
),
section_usage as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('section', x.section, 'views', x.views)
      order by x.views desc, x.section
    ),
    '[]'::jsonb
  ) as value
  from (
    select coalesce(nullif(a.metadata->>'section',''),'unknown') as section, count(*) as views
    from public.analytics_events a
    where a.event_name='section_view' and coalesce(a.metadata->>'section','') <> 'flashcards'
    group by 1
  ) x
),
daily as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.day,
        'visitors', d.visitors,
        'sessions', d.sessions,
        'answers', d.answers,
        'lecture_actions', d.lecture_actions,
        'section_views', d.section_views
      )
      order by d.day
    ),
    '[]'::jsonb
  ) as value
  from (
    select
      (a.occurred_at at time zone 'Asia/Riyadh')::date as day,
      count(distinct a.visitor_id) as visitors,
      count(distinct a.session_id) as sessions,
      count(*) filter (where a.event_name='question_answer') as answers,
      count(*) filter (where a.event_name='lecture_study') as lecture_actions,
      count(*) filter (where a.event_name='section_view') as section_views
    from public.analytics_events a
    where a.occurred_at >= now() - interval '14 days'
    group by 1
  ) d
),
top_topics as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('topic', t.topic, 'answers', t.answers)
      order by t.answers desc, t.topic
    ),
    '[]'::jsonb
  ) as value
  from (
    select a.topic, count(*) as answers
    from public.analytics_events a
    where a.event_name='question_answer' and a.topic is not null
    group by a.topic
    order by count(*) desc
    limit 10
  ) t
),
admin_answer_activity as (
  select user_id,count(*) as answers_total,
    count(*) filter(where created_at>=now()-interval '7 days') as answers_7d,
    max(created_at) as last_answer_at
  from public.game_attempts group by user_id
),
admin_bonus_activity as (
  select user_id,max(created_at) as last_bonus_at from public.game_xp_events group by user_id
),
admin_visit_activity as (
  select user_id,max(occurred_at) as last_seen_at
  from public.analytics_events where user_id is not null group by user_id
),
admin_usage_rows as (
  select u.id as user_id,u.email,
    coalesce(nullif(p.username,''),'Not started') as username,
    p.user_id is not null as has_profile,
    coalesce(p.leaderboard_visible,false) as public_visible,
    coalesce(p.points,0) as points,
    case when p.week_start=((now() at time zone 'Asia/Riyadh')::date-extract(dow from now() at time zone 'Asia/Riyadh')::integer)
      then coalesce(p.weekly_xp,0) else 0 end as weekly_xp,
    case when p.month_start=date_trunc('month',now() at time zone 'Asia/Riyadh')::date
      then coalesce(p.monthly_xp,0) else 0 end as monthly_xp,
    coalesce(a.answers_total,0) as answers_total,
    coalesce(a.answers_7d,0) as answers_7d,
    greatest(a.last_answer_at,b.last_bonus_at,v.last_seen_at) as last_active_at
  from auth.users u
  left join public.game_profiles p on p.user_id=u.id
  left join admin_answer_activity a on a.user_id=u.id
  left join admin_bonus_activity b on b.user_id=u.id
  left join admin_visit_activity v on v.user_id=u.id
  where u.email is not null and coalesce(u.is_anonymous,false)=false
),
admin_private_usage as (
  select coalesce(jsonb_agg(to_jsonb(r) order by r.points desc,r.username,r.user_id),'[]'::jsonb) as leaderboard,
    jsonb_build_object(
      'accounts',count(*),
      'accounts_with_xp',count(*) filter(where points>0),
      'active_7d',count(*) filter(where last_active_at>=now()-interval '7 days'),
      'answers_7d',coalesce(sum(answers_7d),0)
    ) as summary
  from admin_usage_rows r
),
registered as (
  select
    count(*) as registered_users,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'email', u.email,
          'created_at', u.created_at,
          'last_sign_in_at', u.last_sign_in_at
        )
        order by u.created_at desc
      ),
      '[]'::jsonb
    ) as registered_emails
  from auth.users u
  where u.email is not null and coalesce(u.is_anonymous,false)=false
)
select jsonb_build_object(
  'analytics_started_at', s.analytics_started_at,
  'sitewide_tracking_started_at', s.sitewide_tracking_started_at,
  'total_visitors', s.total_visitors,
  'total_sessions', s.total_sessions,
  'total_events', s.total_events,
  'page_views', s.page_views,
  'section_views', s.section_views,
  'questions_answered', s.questions_answered,
  'past_questions_answered', s.past_questions_answered,
  'ai_questions_answered', s.ai_questions_answered,
  'answer_reveals', s.answer_reveals,
  'source_opens', s.source_opens,
  'lecture_study_actions', s.lecture_study_actions,
  'active_signed_in_users', s.active_signed_in_users,
  'visitors_today', s.visitors_today,
  'interactions_today', s.interactions_today,
  'answers_today', s.answers_today,
  'private_leaderboard', pu.leaderboard,
  'private_usage_summary', pu.summary,
  'registered_users', r.registered_users,
  'registered_emails', r.registered_emails,
  'section_usage', su.value,
  'daily', d.value,
  'top_topics', tt.value
)
from summary s
cross join registered r
cross join section_usage su
cross join daily d
cross join top_topics tt
cross join admin_private_usage pu;
$function$;

-- Existing Edge Function validates the admin email with Auth before using service_role.
revoke all on function public.get_admin_analytics() from public, anon, authenticated;
grant execute on function public.get_admin_analytics() to service_role;

