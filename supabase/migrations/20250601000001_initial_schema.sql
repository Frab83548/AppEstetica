-- AppEstetica: schema inicial
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('admin', 'recepcion', 'profesional');
CREATE TYPE turno_estado AS ENUM ('reservado', 'confirmado', 'cancelado', 'reprogramado', 'completado', 'no_show');
CREATE TYPE turno_origen AS ENUM ('panel', 'telegram');
CREATE TYPE ausencia_tipo AS ENUM ('vacacion', 'licencia', 'ausencia');
CREATE TYPE notificacion_canal AS ENUM ('telegram', 'email', 'whatsapp');
CREATE TYPE notificacion_estado AS ENUM ('pendiente', 'enviada', 'fallida', 'cancelada');
CREATE TYPE promocion_tipo AS ENUM ('porcentaje', 'monto_fijo');

CREATE TABLE profesionales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  especialidades TEXT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  google_calendar_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  rol user_role NOT NULL DEFAULT 'recepcion',
  profesional_id UUID REFERENCES profesionales(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT UNIQUE,
  fecha_nacimiento DATE,
  email TEXT,
  telefono TEXT,
  telegram_id BIGINT UNIQUE,
  observaciones TEXT,
  preferencias JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  duracion_min INTEGER NOT NULL CHECK (duracion_min > 0),
  precio NUMERIC(12, 2) NOT NULL CHECK (precio >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE promociones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id UUID REFERENCES servicios(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  tipo promocion_tipo NOT NULL,
  valor NUMERIC(12, 2) NOT NULL CHECK (valor >= 0),
  vigencia_desde DATE,
  vigencia_hasta DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE servicio_profesional (
  servicio_id UUID NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  profesional_id UUID NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  PRIMARY KEY (servicio_id, profesional_id)
);

CREATE TABLE horarios_laborales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  CHECK (hora_fin > hora_inicio)
);

CREATE TABLE ausencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  tipo ausencia_tipo NOT NULL,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin > fecha_inicio)
);

CREATE TABLE turnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  profesional_id UUID NOT NULL REFERENCES profesionales(id),
  servicio_id UUID NOT NULL REFERENCES servicios(id),
  rango TSTZRANGE NOT NULL,
  estado turno_estado NOT NULL DEFAULT 'reservado',
  origen turno_origen NOT NULL DEFAULT 'panel',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE turnos ADD CONSTRAINT turnos_no_solapamiento
  EXCLUDE USING gist (
    profesional_id WITH =,
    rango WITH &&
  ) WHERE (estado IN ('reservado', 'confirmado', 'reprogramado'));

CREATE TABLE cobros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID REFERENCES turnos(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  monto NUMERIC(12, 2) NOT NULL CHECK (monto >= 0),
  medio TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telegram_suscriptores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  opt_in BOOLEAN NOT NULL DEFAULT false,
  opt_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID REFERENCES turnos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  canal notificacion_canal NOT NULL,
  plantilla TEXT NOT NULL,
  contenido TEXT,
  estado notificacion_estado NOT NULL DEFAULT 'pendiente',
  programada_para TIMESTAMPTZ NOT NULL,
  enviada_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL,
  registro_id UUID NOT NULL,
  accion TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE turno_evento_gcal (
  turno_id UUID PRIMARY KEY REFERENCES turnos(id) ON DELETE CASCADE,
  evento_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversaciones_bot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  historial JSONB NOT NULL DEFAULT '[]',
  contexto JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cliente_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  accion TEXT NOT NULL,
  datos JSONB,
  usuario_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_activo ON clientes (activo) WHERE deleted_at IS NULL;
CREATE INDEX idx_turnos_profesional_rango ON turnos USING gist (profesional_id, rango);
CREATE INDEX idx_turnos_cliente ON turnos (cliente_id);
CREATE INDEX idx_notificaciones_pendientes ON notificaciones (programada_para) WHERE estado = 'pendiente';
CREATE INDEX idx_horarios_profesional ON horarios_laborales (profesional_id, dia_semana);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profesionales_updated BEFORE UPDATE ON profesionales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_servicios_updated BEFORE UPDATE ON servicios FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_promociones_updated BEFORE UPDATE ON promociones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_turnos_updated BEFORE UPDATE ON turnos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_telegram_suscriptores_updated BEFORE UPDATE ON telegram_suscriptores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_google_calendar_tokens_updated BEFORE UPDATE ON google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_turno_evento_gcal_updated BEFORE UPDATE ON turno_evento_gcal FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_conversaciones_bot_updated BEFORE UPDATE ON conversaciones_bot FOR EACH ROW EXECUTE FUNCTION set_updated_at();
