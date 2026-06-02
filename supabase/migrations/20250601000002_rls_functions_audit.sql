-- AppEstetica: RLS, funciones de negocio y auditoría

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT rol FROM profiles WHERE id = auth.uid() AND activo = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_my_profesional_id()
RETURNS UUID AS $$
  SELECT profesional_id FROM profiles WHERE id = auth.uid() AND activo = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND activo = true);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin_or_recepcion()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND activo = true AND rol IN ('admin', 'recepcion')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, nombre, apellido, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'apellido', 'Nuevo'),
    COALESCE((NEW.raw_user_meta_data->>'rol')::user_role, 'recepcion')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Audit helper
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  diff JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    diff := to_jsonb(NEW);
    INSERT INTO audit_log (tabla, registro_id, accion, usuario_id, diff)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', auth.uid(), diff);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    diff := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    INSERT INTO audit_log (tabla, registro_id, accion, usuario_id, diff)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', auth.uid(), diff);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    diff := to_jsonb(OLD);
    INSERT INTO audit_log (tabla, registro_id, accion, usuario_id, diff)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', auth.uid(), diff);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_clientes AFTER INSERT OR UPDATE OR DELETE ON clientes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_turnos AFTER INSERT OR UPDATE OR DELETE ON turnos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_profesionales AFTER INSERT OR UPDATE OR DELETE ON profesionales
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_servicios AFTER INSERT OR UPDATE OR DELETE ON servicios
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Cliente historial on update
CREATE OR REPLACE FUNCTION log_cliente_historial()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO cliente_historial (cliente_id, accion, datos, usuario_id)
    VALUES (NEW.id, 'modificacion', jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)), auth.uid());
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO cliente_historial (cliente_id, accion, datos, usuario_id)
    VALUES (NEW.id, 'alta', to_jsonb(NEW), auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_cliente_historial AFTER INSERT OR UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION log_cliente_historial();

-- Disponibilidad y turnos RPC
CREATE OR REPLACE FUNCTION obtener_slots_disponibles(
  p_profesional_id UUID,
  p_servicio_id UUID,
  p_fecha DATE
)
RETURNS TABLE (slot_inicio TIMESTAMPTZ, slot_fin TIMESTAMPTZ) AS $$
DECLARE
  v_duracion INTEGER;
  v_dow SMALLINT;
  v_hora TIME;
  v_fin TIME;
  v_slot_inicio TIMESTAMPTZ;
  v_slot_fin TIMESTAMPTZ;
  v_tz TEXT := 'America/Argentina/Buenos_Aires';
BEGIN
  SELECT duracion_min INTO v_duracion FROM servicios WHERE id = p_servicio_id AND activo = true AND deleted_at IS NULL;
  IF v_duracion IS NULL THEN RETURN; END IF;

  v_dow := EXTRACT(DOW FROM p_fecha)::SMALLINT;

  FOR v_hora, v_fin IN
    SELECT hl.hora_inicio, hl.hora_fin
    FROM horarios_laborales hl
    WHERE hl.profesional_id = p_profesional_id AND hl.dia_semana = v_dow
  LOOP
    v_slot_inicio := (p_fecha + v_hora) AT TIME ZONE v_tz;
    WHILE v_slot_inicio + (v_duracion || ' minutes')::INTERVAL <= (p_fecha + v_fin) AT TIME ZONE v_tz LOOP
      v_slot_fin := v_slot_inicio + (v_duracion || ' minutes')::INTERVAL;

      IF NOT EXISTS (
        SELECT 1 FROM ausencias a
        WHERE a.profesional_id = p_profesional_id
          AND tstzrange(a.fecha_inicio, a.fecha_fin, '[)') && tstzrange(v_slot_inicio, v_slot_fin, '[)')
      ) AND NOT EXISTS (
        SELECT 1 FROM turnos t
        WHERE t.profesional_id = p_profesional_id
          AND t.estado IN ('reservado', 'confirmado', 'reprogramado')
          AND t.rango && tstzrange(v_slot_inicio, v_slot_fin, '[)')
      ) THEN
        slot_inicio := v_slot_inicio;
        slot_fin := v_slot_fin;
        RETURN NEXT;
      END IF;

      v_slot_inicio := v_slot_inicio + (v_duracion || ' minutes')::INTERVAL;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION reservar_turno(
  p_cliente_id UUID,
  p_profesional_id UUID,
  p_servicio_id UUID,
  p_inicio TIMESTAMPTZ,
  p_origen turno_origen DEFAULT 'panel',
  p_notas TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_duracion INTEGER;
  v_fin TIMESTAMPTZ;
  v_turno_id UUID;
BEGIN
  IF NOT is_staff() AND p_origen = 'panel' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT duracion_min INTO v_duracion FROM servicios WHERE id = p_servicio_id AND activo = true AND deleted_at IS NULL;
  IF v_duracion IS NULL THEN RAISE EXCEPTION 'Servicio no válido'; END IF;

  v_fin := p_inicio + (v_duracion || ' minutes')::INTERVAL;

  IF NOT EXISTS (
    SELECT 1 FROM servicio_profesional sp
    WHERE sp.servicio_id = p_servicio_id AND sp.profesional_id = p_profesional_id
  ) THEN
    RAISE EXCEPTION 'Profesional no habilitado para este servicio';
  END IF;

  INSERT INTO turnos (cliente_id, profesional_id, servicio_id, rango, estado, origen, notas)
  VALUES (p_cliente_id, p_profesional_id, p_servicio_id, tstzrange(p_inicio, v_fin, '[)'), 'confirmado', p_origen, p_notas)
  RETURNING id INTO v_turno_id;

  PERFORM programar_notificaciones_turno(v_turno_id);

  RETURN v_turno_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION reprogramar_turno(
  p_turno_id UUID,
  p_nuevo_inicio TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
  v_turno turnos%ROWTYPE;
  v_duracion INTEGER;
  v_fin TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;

  IF get_my_role() = 'profesional' AND v_turno.profesional_id != get_my_profesional_id() THEN
    RAISE EXCEPTION 'No autorizado';
  ELSIF get_my_role() = 'profesional' THEN NULL;
  ELSIF NOT is_admin_or_recepcion() AND get_my_role() != 'admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT duracion_min INTO v_duracion FROM servicios WHERE id = v_turno.servicio_id;
  v_fin := p_nuevo_inicio + (v_duracion || ' minutes')::INTERVAL;

  UPDATE turnos SET
    rango = tstzrange(p_nuevo_inicio, v_fin, '[)'),
    estado = 'reprogramado',
    updated_at = now()
  WHERE id = p_turno_id;

  PERFORM programar_notificaciones_turno(p_turno_id, true);

  RETURN p_turno_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION cancelar_turno(p_turno_id UUID, p_motivo TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_turno turnos%ROWTYPE;
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;

  IF get_my_role() = 'profesional' AND v_turno.profesional_id != get_my_profesional_id() THEN
    RAISE EXCEPTION 'No autorizado';
  ELSIF get_my_role() NOT IN ('admin', 'recepcion', 'profesional') AND NOT is_staff() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE turnos SET estado = 'cancelado', notas = COALESCE(p_motivo, notas), updated_at = now()
  WHERE id = p_turno_id;

  UPDATE notificaciones SET estado = 'cancelada'
  WHERE turno_id = p_turno_id AND estado = 'pendiente';

  INSERT INTO notificaciones (turno_id, cliente_id, canal, plantilla, contenido, programada_para)
  SELECT p_turno_id, v_turno.cliente_id, 'telegram', 'cancelacion',
    'Tu turno fue cancelado.', now()
  WHERE EXISTS (SELECT 1 FROM clientes c WHERE c.id = v_turno.cliente_id AND c.telegram_id IS NOT NULL);

  RETURN p_turno_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION programar_notificaciones_turno(p_turno_id UUID, p_es_reprogramacion BOOLEAN DEFAULT false)
RETURNS VOID AS $$
DECLARE
  v_turno turnos%ROWTYPE;
  v_inicio TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_inicio := lower(v_turno.rango);

  UPDATE notificaciones SET estado = 'cancelada'
  WHERE turno_id = p_turno_id AND estado = 'pendiente';

  IF v_turno.estado = 'cancelado' THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM clientes c WHERE c.id = v_turno.cliente_id AND c.telegram_id IS NOT NULL) THEN
    INSERT INTO notificaciones (turno_id, cliente_id, canal, plantilla, contenido, programada_para)
    VALUES (
      p_turno_id, v_turno.cliente_id, 'telegram',
      CASE WHEN p_es_reprogramacion THEN 'reprogramacion' ELSE 'confirmacion' END,
      CASE WHEN p_es_reprogramacion THEN 'Tu turno fue reprogramado.' ELSE 'Tu turno fue confirmado.' END,
      now()
    );

    IF v_inicio > now() + interval '24 hours' THEN
      INSERT INTO notificaciones (turno_id, cliente_id, canal, plantilla, contenido, programada_para)
      VALUES (p_turno_id, v_turno.cliente_id, 'telegram', 'recordatorio_24h', 'Recordatorio: turno mañana.', v_inicio - interval '24 hours');
    END IF;

    IF v_inicio > now() + interval '2 hours' THEN
      INSERT INTO notificaciones (turno_id, cliente_id, canal, plantilla, contenido, programada_para)
      VALUES (p_turno_id, v_turno.cliente_id, 'telegram', 'recordatorio_2h', 'Recordatorio: turno en 2 horas.', v_inicio - interval '2 hours');
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicio_profesional ENABLE ROW LEVEL SECURITY;
ALTER TABLE horarios_laborales ENABLE ROW LEVEL SECURITY;
ALTER TABLE ausencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_suscriptores ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE turno_evento_gcal ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones_bot ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_historial ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR get_my_role() = 'admin')
  WITH CHECK (id = auth.uid() OR get_my_role() = 'admin');

-- Staff read all core tables
CREATE POLICY staff_select_profesionales ON profesionales FOR SELECT TO authenticated
  USING (is_staff());
CREATE POLICY admin_manage_profesionales ON profesionales FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

CREATE POLICY staff_select_clientes ON clientes FOR SELECT TO authenticated
  USING (is_staff());
CREATE POLICY staff_manage_clientes ON clientes FOR ALL TO authenticated
  USING (is_admin_or_recepcion() OR get_my_role() = 'admin')
  WITH CHECK (is_admin_or_recepcion() OR get_my_role() = 'admin');

CREATE POLICY staff_select_servicios ON servicios FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY admin_manage_servicios ON servicios FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'recepcion')) WITH CHECK (get_my_role() IN ('admin', 'recepcion'));

CREATE POLICY staff_select_promociones ON promociones FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY admin_manage_promociones ON promociones FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'recepcion')) WITH CHECK (get_my_role() IN ('admin', 'recepcion'));

CREATE POLICY staff_select_sp ON servicio_profesional FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY admin_manage_sp ON servicio_profesional FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'recepcion')) WITH CHECK (get_my_role() IN ('admin', 'recepcion'));

CREATE POLICY staff_select_horarios ON horarios_laborales FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY admin_manage_horarios ON horarios_laborales FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'recepcion')) WITH CHECK (get_my_role() IN ('admin', 'recepcion'));

CREATE POLICY staff_select_ausencias ON ausencias FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY admin_manage_ausencias ON ausencias FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'recepcion')) WITH CHECK (get_my_role() IN ('admin', 'recepcion'));

-- Turnos: recepcion/admin all, profesional own
CREATE POLICY staff_select_turnos ON turnos FOR SELECT TO authenticated
  USING (
    is_admin_or_recepcion() OR get_my_role() = 'admin'
    OR (get_my_role() = 'profesional' AND profesional_id = get_my_profesional_id())
  );
CREATE POLICY staff_manage_turnos ON turnos FOR ALL TO authenticated
  USING (is_admin_or_recepcion() OR get_my_role() = 'admin')
  WITH CHECK (is_admin_or_recepcion() OR get_my_role() = 'admin');

CREATE POLICY staff_select_cobros ON cobros FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY staff_manage_cobros ON cobros FOR ALL TO authenticated
  USING (is_admin_or_recepcion() OR get_my_role() = 'admin')
  WITH CHECK (is_admin_or_recepcion() OR get_my_role() = 'admin');

CREATE POLICY admin_select_audit ON audit_log FOR SELECT TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY staff_select_historial ON cliente_historial FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY admin_gcal_tokens ON google_calendar_tokens FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY staff_select_gcal_events ON turno_evento_gcal FOR SELECT TO authenticated USING (is_staff());

CREATE POLICY admin_notificaciones ON notificaciones FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'recepcion'));

-- Service role only tables for bot (no direct client access)
CREATE POLICY deny_telegram_direct ON telegram_suscriptores FOR ALL TO authenticated USING (false);
CREATE POLICY deny_conversaciones_direct ON conversaciones_bot FOR ALL TO authenticated USING (false);

GRANT EXECUTE ON FUNCTION obtener_slots_disponibles TO authenticated;
GRANT EXECUTE ON FUNCTION reservar_turno TO authenticated;
GRANT EXECUTE ON FUNCTION reprogramar_turno TO authenticated;
GRANT EXECUTE ON FUNCTION cancelar_turno TO authenticated;
