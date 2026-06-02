-- Endurecer permisos de funciones internas
REVOKE ALL ON FUNCTION audit_trigger_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION log_cliente_historial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION programar_notificaciones_turno(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_my_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_my_profesional_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_admin_or_recepcion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_profesional_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_or_recepcion() TO authenticated;
ALTER FUNCTION set_updated_at() SET search_path = public;
