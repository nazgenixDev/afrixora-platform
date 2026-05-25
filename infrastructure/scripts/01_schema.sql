-- Create the sensor_readings hypertable for TimescaleDB
CREATE TABLE sensor_readings (
  time       TIMESTAMPTZ    NOT NULL,
  tenant_id  UUID           NOT NULL,
  device_id  UUID           NOT NULL,
  metric     TEXT           NOT NULL,  -- power_w | temp_c | humidity_pct | state | motion
  value      DOUBLE PRECISION NOT NULL,
  unit       TEXT
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('sensor_readings', 'time');

-- Create indexes for efficient querying
CREATE INDEX ON sensor_readings (device_id, time DESC);
CREATE INDEX ON sensor_readings (tenant_id, time DESC);