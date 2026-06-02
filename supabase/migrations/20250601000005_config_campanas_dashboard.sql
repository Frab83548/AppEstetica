-- Configuracion del negocio, campanas marketing, stats dashboard, seed demo

CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_configuracion_updated BEFORE UPDATE ON configuracion
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO configuracion (clave, valor) VALUES
  ('politica_cancelacion', '{"horas_minimas": 24, "permitir_no_show": true, "mensaje": "Cancelaciones con menos de 24 horas pueden tener penalidad según política del centro."}'::jsonb),
  ('negocio', '{"nombre": "Estética Profesional", "moneda": "ARS", "timezone": "America/Argentina/Buenos_Aires"}'::jsonb);

CREATE TYPE campana_segmento AS ENUM ('todos', 'frecuentes', 'inactivos', 'por_servicio');
CREATE TYPE campana_estado AS ENUM ('borrador', 'programada', 'enviando', 'completada', 'cancelada');

CREATE TABLE campanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  segmento campana_segmento NOT NULL DEFAULT 'todos',
  servicio_id UUID REFERENCES servicios(id) ON DELETE SET NULL,
  estado campana_estado NOT NULL DEFAULT 'borrador',
  programada_para TIMESTAMPTZ,
  enviados INTEGER NOT NULL DEFAULT 0,
  fallidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_campanas_updated BEFORE UPDATE ON campanas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE campana_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  error TEXT,
  enviado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campana_envios_pendientes ON campana_envios (campana_id, estado) WHERE estado = 'pendiente';

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY config_select ON configuracion FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY config_manage ON configuracion FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

CREATE POLICY campanas_select ON campanas FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'recepcion'));
CREATE POLICY campanas_manage ON campanas FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

CREATE POLICY campana_envios_admin ON campana_envios FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION obtener_dashboard_stats(p_desde DATE, p_hasta DATE)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_facturacion NUMERIC;
  v_turnos_total INTEGER;
  v_cancelados INTEGER;
  v_ocupacion NUMERIC;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_facturacion
  FROM cobros WHERE fecha::date BETWEEN p_desde AND p_hasta;

  SELECT COUNT(*) INTO v_turnos_total
  FROM turnos WHERE lower(rango)::date BETWEEN p_desde AND p_hasta
    AND estado IN ('confirmado', 'completado', 'reprogramado', 'reservado');

  SELECT COUNT(*) INTO v_cancelados
  FROM turnos WHERE lower(rango)::date BETWEEN p_desde AND p_hasta AND estado = 'cancelado';

  IF v_turnos_total + v_cancelados > 0 THEN
    v_ocupacion := ROUND((v_turnos_total::numeric / (v_turnos_total + v_cancelados)) * 100, 1);
  ELSE
    v_ocupacion := 0;
  END IF;

  SELECT jsonb_build_object(
    'facturacion_mes', v_facturacion,
    'turnos_periodo', v_turnos_total,
    'cancelaciones', v_cancelados,
    'ocupacion_pct', v_ocupacion,
    'servicios_top', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) FROM (
        SELECT sv.nombre, COUNT(*) AS cantidad
        FROM turnos t JOIN servicios sv ON sv.id = t.servicio_id
        WHERE lower(t.rango)::date BETWEEN p_desde AND p_hasta
          AND t.estado NOT IN ('cancelado')
        GROUP BY sv.nombre ORDER BY cantidad DESC LIMIT 5
      ) s
    ),
    'profesionales_top', (
      SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) FROM (
        SELECT pr.nombre || ' ' || pr.apellido AS nombre, COUNT(*) AS cantidad
        FROM turnos t JOIN profesionales pr ON pr.id = t.profesional_id
        WHERE lower(t.rango)::date BETWEEN p_desde AND p_hasta
          AND t.estado NOT IN ('cancelado')
        GROUP BY pr.id, pr.nombre, pr.apellido ORDER BY cantidad DESC LIMIT 5
      ) p
    ),
    'clientes_frecuentes', (
      SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) FROM (
        SELECT cl.nombre || ' ' || cl.apellido AS nombre, COUNT(*) AS visitas
        FROM turnos t JOIN clientes cl ON cl.id = t.cliente_id
        WHERE lower(t.rango)::date BETWEEN p_desde AND p_hasta
          AND t.estado IN ('completado', 'confirmado')
        GROUP BY cl.id, cl.nombre, cl.apellido ORDER BY visitas DESC LIMIT 5
      ) c
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION reporte_turnos(
  p_desde TIMESTAMPTZ,
  p_hasta TIMESTAMPTZ,
  p_profesional_id UUID DEFAULT NULL,
  p_servicio_id UUID DEFAULT NULL
)
RETURNS TABLE (
  turno_id UUID,
  fecha TIMESTAMPTZ,
  cliente TEXT,
  profesional TEXT,
  servicio TEXT,
  precio NUMERIC,
  estado turno_estado,
  origen turno_origen
) AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  RETURN QUERY
  SELECT
    t.id,
    lower(t.rango),
    cl.nombre || ' ' || cl.apellido,
    pr.nombre || ' ' || pr.apellido,
    sv.nombre,
    sv.precio,
    t.estado,
    t.origen
  FROM turnos t
  JOIN clientes cl ON cl.id = t.cliente_id
  JOIN profesionales pr ON pr.id = t.profesional_id
  JOIN servicios sv ON sv.id = t.servicio_id
  WHERE lower(t.rango) >= p_desde AND lower(t.rango) <= p_hasta
    AND (p_profesional_id IS NULL OR t.profesional_id = p_profesional_id)
    AND (p_servicio_id IS NULL OR t.servicio_id = p_servicio_id)
  ORDER BY lower(t.rango);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION obtener_dashboard_stats TO authenticated;
GRANT EXECUTE ON FUNCTION reporte_turnos TO authenticated;

-- Seed profesionales demo (solo si no existen)
DO $$
DECLARE
  v_prof1 UUID;
  v_prof2 UUID;
  v_sid UUID;
  v_dow INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profesionales LIMIT 1) THEN
    INSERT INTO profesionales (nombre, apellido, email, telefono, especialidades)
    VALUES ('María', 'González', 'maria@estetica.local', '+5491112345678', ARRAY['Manicura', 'Pedicura'])
    RETURNING id INTO v_prof1;

    INSERT INTO profesionales (nombre, apellido, email, telefono, especialidades)
    VALUES ('Lucía', 'Fernández', 'lucia@estetica.local', '+5491187654321', ARRAY['Facial', 'Depilación'])
    RETURNING id INTO v_prof2;

    FOR v_dow IN 1..5 LOOP
      INSERT INTO horarios_laborales (profesional_id, dia_semana, hora_inicio, hora_fin)
      VALUES (v_prof1, v_dow, '09:00', '18:00'), (v_prof2, v_dow, '10:00', '19:00');
    END LOOP;

    FOR v_sid IN SELECT id FROM servicios LOOP
      INSERT INTO servicio_profesional (servicio_id, profesional_id)
      VALUES (v_sid, v_prof1), (v_sid, v_prof2)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;
