begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(46);

update public.system_controls set
  email_delivery_enabled = true,
  delivery_worker_paused = false
where singleton;

select has_table('public', 'delivery_send_attempts', 'delivery send attempts are durably audited');
select has_table('public', 'system_controls', 'owner system controls exist');
select has_table('public', 'backup_runs', 'backup and restore status is durable');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.delivery_send_attempts'::regclass), 'attempt audit has forced RLS');
select ok(not has_table_privilege('anon', 'public.backup_runs', 'SELECT'), 'browser roles cannot inspect backup state');
select ok(not has_function_privilege('authenticated', 'public.load_delivery_render_context(uuid,uuid)', 'EXECUTE'), 'browser roles cannot load subscriber delivery context');
select ok(has_function_privilege('service_role', 'public.begin_delivery_send(uuid,uuid,timestamptz)', 'EXECUTE'), 'service worker can use the mandatory final send gate');

insert into public.subscribers (id, email, name, status, verified_at, consent_at, consent_version)
values ('91000000-0000-4000-8000-000000000001', 'phase9@example.com', 'Phase Nine Reader', 'active', '2026-07-19', '2026-07-01', '2026-07-12');
insert into public.subscriber_preferences (subscriber_id,country_code,state_region,language,categories,story_count,theme)
values ('91000000-0000-4000-8000-000000000001','IN','Kerala','en',array['technology-ai']::public.news_category[],4,'light-editorial');
insert into public.subscriber_schedules (subscriber_id,frequency,local_delivery_time,timezone,next_delivery_at)
values ('91000000-0000-4000-8000-000000000001','daily','08:00','Asia/Kolkata','2026-07-20 02:30+00');

create temporary table phase9_source as select id from public.sources order by id limit 1;
update public.sources set publisher_icon_url = 'https://publisher.example/icon.png' where id = (select id from phase9_source);
insert into public.articles (id,source_id,original_title,normalized_title,description,canonical_url,canonical_url_hash,normalized_title_hash,published_at,processing_status,next_processing_at,processed_at)
values
('92000000-0000-4000-8000-000000000001',(select id from phase9_source),'First','first','Facts','https://publisher.example/first',digest('p9-first','sha256'),digest('p9-first-title','sha256'),'2026-07-19 20:00+00','processed','2026-07-19','2026-07-19'),
('92000000-0000-4000-8000-000000000002',(select id from phase9_source),'Second','second','Facts','https://publisher.example/second',digest('p9-second','sha256'),digest('p9-second-title','sha256'),'2026-07-19 21:00+00','processed','2026-07-19','2026-07-19');
insert into public.story_clusters (id,public_reference,status,category,central_topics,entities,evidence_strength,current_version,latest_event_at,verified_at,evidence_independence_count,evidence_result,conflict_details,verification_version)
values
('93000000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000001','verified','technology-ai',array['first'],'{}','strong',1,'2026-07-19 20:00+00','2026-07-19 21:00+00',2,'{}','[]','phase-7-v1'),
('93000000-0000-4000-8000-000000000002','93100000-0000-4000-8000-000000000002','verified','science',array['second'],'{}','sufficient',2,'2026-07-19 21:00+00','2026-07-19 22:00+00',1,'{}','[]','phase-7-v1');
insert into public.story_cluster_articles (cluster_id,article_id,decision,decision_method,added_in_version) values
('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','accepted','fixture',1),
('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','accepted','fixture',2);
insert into public.cluster_summaries (id,cluster_id,cluster_version,language,status,headline,summary,why_it_matters,verification_result,prompt_version,schema_version,provider,model,verified_at,source_references,verification_version)
values
('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',1,'en','verified','Exact first headline','One. Two. Three.','First reason.','{"passed":true}','p7','s7','fixture','fixture','2026-07-19','[]','v7'),
('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002',2,'en','verified','Exact second headline','Four. Five. Six.','Second reason.','{"passed":true}','p7','s7','fixture','fixture','2026-07-19','[]','v7');
insert into public.cluster_summary_articles (summary_id,article_id,citation_order) values
('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',1),
('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002',1);

insert into public.deliveries (id,subscriber_id,scheduled_for,status,preference_version,language,theme,attempt_count,next_attempt_at,news_window_started_at,news_window_ended_at,personalization_status,personalized_at,personalization_version,actual_story_count)
values
('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','2026-07-20 02:30+00','pending',1,'en','light-editorial',0,'2026-07-20 02:30+00','2026-07-19 02:30+00','2026-07-20 02:30+00','ready','2026-07-20 02:29+00','p8',2),
('95000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','2026-07-21 02:30+00','pending',1,'en','light-editorial',0,'2026-07-20 02:30+00','2026-07-20 02:30+00','2026-07-21 02:30+00','pending',null,null,null);
insert into public.delivery_stories (delivery_id,position,cluster_id,cluster_public_reference,cluster_version,summary_id,summary_language,is_update,selection_score,selection_reasons,subject_key)
values
('95000000-0000-4000-8000-000000000001',1,'93000000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000001',1,'94000000-0000-4000-8000-000000000001','en',false,80,'{}','first'),
('95000000-0000-4000-8000-000000000001',2,'93000000-0000-4000-8000-000000000002','93100000-0000-4000-8000-000000000002',2,'94000000-0000-4000-8000-000000000002','en',true,70,'{}','second');

select is((select count(*)::integer from public.claim_deliveries('96000000-0000-4000-8000-000000000001',10,300,'2026-07-20 02:31+00')),1,'only personalization-ready work is claimed');
select is((select attempt_count from public.deliveries where id='95000000-0000-4000-8000-000000000001'),1::smallint,'claim records the exact attempt number');
create temporary table p9_claim as select id as delivery_id, lease_token from public.deliveries where id='95000000-0000-4000-8000-000000000001';
select is((public.load_delivery_render_context((select delivery_id from p9_claim),(select lease_token from p9_claim))->'stories'->0->>'summaryId'),'94000000-0000-4000-8000-000000000001','render context uses the exact first stored summary');
select is((public.load_delivery_render_context((select delivery_id from p9_claim),(select lease_token from p9_claim))->'stories'->1->>'summaryId'),'94000000-0000-4000-8000-000000000002','render context preserves ascending stored position');
select is((public.load_delivery_render_context((select delivery_id from p9_claim),(select lease_token from p9_claim))->'stories'->0->'sources'->0->>'url'),'https://publisher.example/first','original publisher URL is direct and unchanged');
select is((public.load_delivery_render_context((select delivery_id from p9_claim),(select lease_token from p9_claim))->'stories'->0->'sources'->0->>'iconUrl'),'https://publisher.example/icon.png','reviewed normalized publisher icon is returned when available');
select ok(public.mark_delivery_rendered((select delivery_id from p9_claim),(select lease_token from p9_claim),2::smallint,'2026-07-20 02:32+00'),'exact stored count can be marked rendered');
select ok(public.begin_delivery_send((select delivery_id from p9_claim),(select lease_token from p9_claim),'2026-07-20 02:32:01+00'),'active unchanged subscriber passes the final SMTP gate');
select is((select outcome from public.delivery_send_attempts where delivery_id='95000000-0000-4000-8000-000000000001'),'started','send attempt starts only at the final gate');
select ok(public.complete_delivery_send_with_receipt((select delivery_id from p9_claim),(select lease_token from p9_claim),'fixture-message-id','2026-07-20 02:32:02+00'),'SMTP acceptance completes through a receipt-aware transition');
select is((select status::text||':'||outcome from public.deliveries join public.delivery_send_attempts on delivery_id=deliveries.id where deliveries.id='95000000-0000-4000-8000-000000000001'),'sent:accepted','success and attempt audit agree exactly');
select is((select count(*)::integer from public.claim_deliveries('96000000-0000-4000-8000-000000000002',10,300,'2026-07-20 02:33+00')),0,'success is never reclaimed or resent');

-- Ready empty briefing plus stale-preference cancellation.
insert into public.deliveries (id,subscriber_id,scheduled_for,status,preference_version,language,theme,next_attempt_at,news_window_started_at,news_window_ended_at,personalization_status,personalized_at,personalization_version,actual_story_count)
values ('95000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','2026-07-22 02:30+00','pending',1,'en','midnight-brief','2026-07-22 02:30+00','2026-07-21 02:30+00','2026-07-22 02:30+00','ready','2026-07-22 02:29+00','p8',0);
create temporary table p9_empty_claim as select * from public.claim_deliveries('96000000-0000-4000-8000-000000000003',1,300,'2026-07-22 02:31+00');
select is((public.load_delivery_render_context((select delivery_id from p9_empty_claim),(select lease_token from p9_empty_claim))->'stories')::text,'[]','zero-story delivery is honest and renderable');
select ok(public.mark_delivery_rendered((select delivery_id from p9_empty_claim),(select lease_token from p9_empty_claim),0::smallint,'2026-07-22 02:31:01+00'),'zero-story delivery passes exact count validation');
update public.subscriber_preferences set version=2 where subscriber_id='91000000-0000-4000-8000-000000000001';
select ok(not public.begin_delivery_send((select delivery_id from p9_empty_claim),(select lease_token from p9_empty_claim),'2026-07-22 02:31:02+00'),'stale preference snapshot is cancelled before SMTP');
select is((select status::text||':'||failure_code from public.deliveries where id='95000000-0000-4000-8000-000000000003'),'cancelled:preferences-changed','stale preference cancellation is explicit');
update public.subscriber_preferences set version=1 where subscriber_id='91000000-0000-4000-8000-000000000001';

-- Kill switch defers, not sends or cancels.
insert into public.deliveries (id,subscriber_id,scheduled_for,status,preference_version,language,theme,next_attempt_at,news_window_started_at,news_window_ended_at,personalization_status,personalized_at,personalization_version,actual_story_count)
values ('95000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','2026-07-23 02:30+00','pending',1,'en','amber-brief','2026-07-23 02:30+00','2026-07-22 02:30+00','2026-07-23 02:30+00','ready','2026-07-23 02:29+00','p8',0);
create temporary table p9_kill_claim as select * from public.claim_deliveries('96000000-0000-4000-8000-000000000004',1,300,'2026-07-23 02:31+00');
select ok(public.mark_delivery_rendered((select delivery_id from p9_kill_claim),(select lease_token from p9_kill_claim),0::smallint,'2026-07-23 02:31:01+00'),'kill-switch fixture reaches rendered state');
update public.system_controls set email_delivery_enabled=false where singleton;
select ok(not public.begin_delivery_send((select delivery_id from p9_kill_claim),(select lease_token from p9_kill_claim),'2026-07-23 02:31:02+00'),'global kill switch blocks final SMTP gate');
select is((select status::text||':'||failure_code from public.deliveries where id='95000000-0000-4000-8000-000000000004'),'retry-wait:email-delivery-disabled','kill switch safely defers unsent work');
select is((select count(*)::integer from public.claim_deliveries('96000000-0000-4000-8000-000000000005',10,300,'2026-07-23 03:00+00')),0,'kill switch stops new claims');
update public.system_controls set email_delivery_enabled=true where singleton;

-- Expired pre-SMTP is retryable; expired sending is terminal ambiguous.
update public.deliveries set status='claimed',lease_token=gen_random_uuid(),lease_owner=gen_random_uuid(),lease_expires_at='2026-07-23 02:00+00' where id='95000000-0000-4000-8000-000000000004';
select is((select retryable_count from public.recover_expired_delivery_leases('2026-07-23 03:00+00')),1,'expired pre-SMTP lease is recovered for request-timeout retry');
update public.deliveries set status='sending',attempt_count=2,lease_token='97000000-0000-4000-8000-000000000001',lease_owner=gen_random_uuid(),lease_expires_at='2026-07-23 02:00+00' where id='95000000-0000-4000-8000-000000000004';
insert into public.delivery_send_attempts(delivery_id,attempt_number,lease_token,started_at) values('95000000-0000-4000-8000-000000000004',2,'97000000-0000-4000-8000-000000000001','2026-07-23 01:59+00');
select is((select ambiguous_count from public.recover_expired_delivery_leases('2026-07-23 03:01+00')),1,'expired sending lease becomes terminal ambiguous rather than resent');
select is((select status::text||':'||failure_class from public.deliveries where id='95000000-0000-4000-8000-000000000004'),'failed:ambiguous','ambiguous SMTP outcome is owner-visible and permanent');
select ok(not public.owner_retry_temporary_delivery('95000000-0000-4000-8000-000000000004',gen_random_uuid(),'2026-07-23 03:02+00'),'owner cannot retry an ambiguous or permanent outcome');

-- Admin token/session and alert deduplication.
select ok(public.issue_admin_access_token(digest('owner','sha256'),digest('access','sha256'),'2026-07-24 00:15+00','2026-07-24 00:00+00') is not null,'owner one-time access token stores hashes only');
select ok(public.consume_admin_access_token(digest('access','sha256'),digest('session','sha256'),digest('csrf','sha256'),'2026-07-24 01:00+00','2026-07-24 00:01+00'),'owner access token creates a short session once');
select ok(not public.consume_admin_access_token(digest('access','sha256'),digest('session2','sha256'),digest('csrf2','sha256'),'2026-07-24 01:00+00','2026-07-24 00:02+00'),'owner access token replay is rejected');
select is((select count(*)::integer from public.validate_admin_session(digest('session','sha256'),digest('csrf','sha256'),'2026-07-24 00:03+00')),1,'owner session requires the stored CSRF hash');
select ok(public.record_operational_alert('phase9-test','critical','Test alert','{}','2026-07-24 00:00+00'),'first critical alert requests one notification');
select ok(not public.record_operational_alert('phase9-test','critical','Test alert','{}','2026-07-24 00:05+00'),'duplicate critical alert inside cooldown does not create alert fatigue');
select is((select occurrence_count from public.alert_events where deduplication_key='phase9-test'),2,'deduplicated alert retains occurrence count');
select ok(not public.record_consecutive_operational_alert('phase9-consecutive',3,'Consecutive alert','{"stage":"claim-deliveries","errorCode":"database-error"}','2026-07-24 00:00+00'),'first consecutive failure remains a warning');
select ok(not public.record_consecutive_operational_alert('phase9-consecutive',3,'Consecutive alert','{"stage":"claim-deliveries","errorCode":"database-error"}','2026-07-24 00:01+00'),'second consecutive failure remains a warning');
select ok(public.record_consecutive_operational_alert('phase9-consecutive',3,'Consecutive alert','{"stage":"claim-deliveries","errorCode":"database-error"}','2026-07-24 00:02+00'),'third consecutive failure escalates and requests notification');
select is((select severity::text||':'||occurrence_count from public.alert_events where deduplication_key='phase9-consecutive'),'critical:3','consecutive alert records the escalation threshold');
select ok(public.resolve_operational_alert('phase9-consecutive','2026-07-24 00:03+00'),'successful worker run resolves the open alert');
select is((select status::text from public.alert_events where deduplication_key='phase9-consecutive'),'resolved','resolved alert is no longer shown as open');
select ok(not public.record_consecutive_operational_alert('phase9-consecutive',3,'Consecutive alert','{"stage":"heartbeat-start","errorCode":"database-error"}','2026-07-24 00:04+00'),'failure after recovery starts a new consecutive sequence');
select is((select severity::text||':'||occurrence_count from public.alert_events where deduplication_key='phase9-consecutive'),'warning:1','reopened alert resets its consecutive failure count');

select * from finish();
rollback;
