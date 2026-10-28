-- Rodando UTP GreenShare v6.2: esquema PostgreSQL/Neon.
-- Idempotente: ejecutar de nuevo NO borra información.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  student_id VARCHAR(30) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  career VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rides (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin VARCHAR(100) NOT NULL,
  pickup_point VARCHAR(150) NOT NULL,
  destination VARCHAR(150) NOT NULL DEFAULT 'Universidad Tecnológica de Puebla',
  departure_at TIMESTAMPTZ NOT NULL,
  seats_total INTEGER NOT NULL CHECK (seats_total BETWEEN 1 AND 6),
  contribution_cents INTEGER NOT NULL CHECK (contribution_cents >= 0),
  vehicle VARCHAR(100) NOT NULL,
  color VARCHAR(50) NOT NULL,
  plate_last4 VARCHAR(4) NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  route_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (route_type IN ('direct','connection')),
  connection_hub VARCHAR(100) NOT NULL DEFAULT '',
  parking_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  parking_code TEXT NOT NULL DEFAULT '',
  parking_generated_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id BIGSERIAL PRIMARY KEY,
  ride_id BIGINT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 3),
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, passenger_id)
);

CREATE TABLE IF NOT EXISTS eco_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_departure ON rides(departure_at);
CREATE INDEX IF NOT EXISTS idx_reservations_ride ON reservations(ride_id);
CREATE INDEX IF NOT EXISTS idx_eco_events_user ON eco_events(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_parking_code ON rides(parking_code) WHERE parking_code <> '';


-- Suscripciones por dispositivo. Una cuenta puede tener varias.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Bandeja de notificaciones consultable dentro de Rodando UTP.
CREATE TABLE IF NOT EXISTS app_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(90) NOT NULL,
  body VARCHAR(230) NOT NULL,
  target_url VARCHAR(180) NOT NULL DEFAULT '/#avisos',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_date
  ON app_notifications(user_id, created_at DESC);
