-- Add the Midnight Brief edition without changing either established theme.
-- PostgreSQL enum values are stable storage identifiers; the display name
-- remains centralized in the web product configuration.

alter type public.briefing_theme add value if not exists 'midnight-brief';
