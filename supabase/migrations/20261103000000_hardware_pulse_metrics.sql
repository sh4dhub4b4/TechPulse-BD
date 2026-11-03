-- 006_hardware_pulse_metrics.sql
-- Live Hardware Pulse: catalog, scraper sync and rolling community feedback counters.

CREATE OR REPLACE FUNCTION public.get_hardware_pulse_metrics()
RETURNS TABLE (
  total_products BIGINT,
  updated_today BIGINT,
  feedback_last_hour BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.products WHERE stock_status <> 'Discontinued') AS total_products,
    (SELECT COUNT(*) FROM public.products WHERE last_scraped_at >= NOW() - INTERVAL '24 hours') AS updated_today,
    (
      (SELECT COUNT(*) FROM public.comments WHERE created_at >= NOW() - INTERVAL '1 hour') +
      (SELECT COUNT(*) FROM public.community_posts WHERE created_at >= NOW() - INTERVAL '1 hour')
    ) AS feedback_last_hour;
$$;

GRANT EXECUTE ON FUNCTION public.get_hardware_pulse_metrics() TO anon, authenticated;
