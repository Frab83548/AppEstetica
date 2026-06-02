-- Storage bucket and seed servicios (local migration mirror)
INSERT INTO storage.buckets (id, name, public) VALUES ('estetica-archivos', 'estetica-archivos', false) ON CONFLICT (id) DO NOTHING;
