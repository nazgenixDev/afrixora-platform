-- Exécuter après les migrations de l’application et le schéma TimescaleDB.
\getenv api_password DB_API_PASSWORD
\getenv grafana_password DB_GRAFANA_PASSWORD
\getenv backup_password DB_BACKUP_PASSWORD

SELECT pg_advisory_xact_lock(hashtext('afrixora.database.roles'));

-- Évite de transmettre les mots de passe de provisionnement aux journaux SQL.
SET LOCAL log_statement = 'none';
SET LOCAL log_min_error_statement = 'panic';

SELECT format('CREATE ROLE %I', role_name)
FROM (VALUES ('afrixora_api'), ('afrixora_grafana'), ('afrixora_backup')) AS roles(role_name)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name)
\gexec

ALTER ROLE afrixora_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_password';
ALTER ROLE afrixora_grafana LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'grafana_password';
ALTER ROLE afrixora_backup LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'backup_password';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO afrixora_api, afrixora_grafana;

-- Inclut les tables des nouvelles migrations, sauf l’historique Prisma.
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO afrixora_api', relname)
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind IN ('r', 'p')
  AND relname NOT IN ('_prisma_migrations', 'sensor_readings')
  AND NOT EXISTS (
    SELECT FROM pg_depend
    WHERE classid = 'pg_class'::regclass AND objid = pg_class.oid AND deptype = 'e'
  )
\gexec

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO afrixora_api;
GRANT SELECT, INSERT, DELETE ON public.sensor_readings TO afrixora_api;
GRANT SELECT ON public.sensor_readings_hourly TO afrixora_api;

CREATE OR REPLACE VIEW public.grafana_power_readings WITH (security_barrier = true) AS
SELECT time, value, device_id
FROM public.sensor_readings
WHERE metric = 'power_w';

CREATE OR REPLACE VIEW public.grafana_devices AS
SELECT name, "isOnline", type FROM public."Device";

CREATE OR REPLACE VIEW public.grafana_alert_counts AS
SELECT count(*) AS unread FROM public."Alert" WHERE NOT "isRead";

GRANT SELECT ON public.grafana_power_readings, public.grafana_devices, public.grafana_alert_counts TO afrixora_grafana;

-- La sauvegarde doit également lire les relations internes et les chunks TimescaleDB.
GRANT pg_read_all_data TO afrixora_backup;
