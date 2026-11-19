-- Paramètre psql fourni par deploy.sh. Valeur par défaut pour un lancement manuel.
\if :{?RETENTION_DAYS}
\else
  \set RETENTION_DAYS 365
\endif

SELECT (CASE WHEN :'RETENTION_DAYS' ~ '^[1-9][0-9]*$'
             THEN :'RETENTION_DAYS'
             ELSE 'RETENTION_DAYS doit être un entier strictement positif'
        END)::integer AS retention_days \gset

-- Sérialise les installations du schéma lancées dans une transaction.
SELECT pg_advisory_xact_lock(hashtext('afrixora.sensor_readings.schema'));
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS public.sensor_readings (
  time       TIMESTAMPTZ      NOT NULL,
  tenant_id  UUID             NOT NULL,
  device_id  UUID             NOT NULL,
  metric     TEXT             NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  unit       TEXT
);

SELECT create_hypertable('public.sensor_readings', 'time',
                         if_not_exists => TRUE, migrate_data => TRUE);

CREATE INDEX IF NOT EXISTS sensor_readings_device_id_time_idx
  ON public.sensor_readings (device_id, time DESC);
CREATE INDEX IF NOT EXISTS sensor_readings_tenant_id_time_idx
  ON public.sensor_readings (tenant_id, time DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.sensor_readings_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '1 hour', time) AS bucket,
       tenant_id,
       device_id,
       metric,
       unit,
       count(*) AS sample_count,
       min(value) AS min_value,
       max(value) AS max_value,
       avg(value) AS avg_value,
       sum(value) AS sum_value
FROM public.sensor_readings
GROUP BY bucket, tenant_id, device_id, metric, unit
WITH NO DATA;

-- L’agrégat suit les données brutes, y compris lors de leur expiration.
SELECT add_continuous_aggregate_policy('public.sensor_readings_hourly',
  start_offset => NULL,
  end_offset => INTERVAL '0 hours',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

SELECT add_retention_policy('public.sensor_readings',
                            drop_after => make_interval(days => :retention_days),
                            if_not_exists => TRUE)
WHERE NOT EXISTS (
  SELECT 1 FROM timescaledb_information.jobs
  WHERE proc_name = 'policy_retention'
    AND hypertable_schema = 'public'
    AND hypertable_name = 'sensor_readings'
);

-- Une modification de RETENTION_DAYS met à jour la tâche existante.
SELECT alter_job(job_id, config => (config - 'drop_created_before') ||
  jsonb_build_object('drop_after', make_interval(days => :retention_days)))
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_retention'
  AND hypertable_schema = 'public'
  AND hypertable_name = 'sensor_readings'
  AND (config->>'drop_after')::interval IS DISTINCT FROM make_interval(days => :retention_days);
