-- Keep feed scheduling deliberately simple: every active, verified feed is
-- checked every 30 minutes. The worker still wakes every minute, but only
-- claims sources whose individual next_fetch_at timestamp is due.
update public.sources
set expected_update_interval = interval '30 minutes'
where is_active
  and technical_status = 'verified';

