import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  return res.json();
}

async function getValidToken() {
  const { data: tokens } = await supabase.from('google_calendar_tokens').select('*').limit(1).maybeSingle();
  if (!tokens) throw new Error('Google Calendar no conectado');

  if (new Date(tokens.expires_at) > new Date(Date.now() + 60000)) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase.from('google_calendar_tokens').update({
    access_token: refreshed.access_token,
    expires_at: expiresAt,
  }).eq('id', tokens.id);

  return refreshed.access_token as string;
}

async function syncTurno(turnoId: string, action: 'upsert' | 'delete') {
  const { data: turno } = await supabase.from('turnos').select(`
    id, rango, estado, notas,
    clientes(nombre, apellido, telefono),
    servicios(nombre, duracion_min),
    profesionales(nombre, apellido, google_calendar_id)
  `).eq('id', turnoId).maybeSingle();

  if (!turno) return;

  const prof = turno.profesionales as { google_calendar_id?: string; nombre: string; apellido: string };
  const calendarId = prof.google_calendar_id;
  if (!calendarId) return;

  const accessToken = await getValidToken();
  const { data: mapping } = await supabase.from('turno_evento_gcal').select('*').eq('turno_id', turnoId).maybeSingle();

  if (action === 'delete' || turno.estado === 'cancelado') {
    if (mapping) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${mapping.evento_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await supabase.from('turno_evento_gcal').delete().eq('turno_id', turnoId);
    }
    return;
  }

  if (!['confirmado', 'reprogramado', 'reservado'].includes(turno.estado)) return;

  const cliente = turno.clientes as { nombre: string; apellido: string; telefono?: string };
  const servicio = turno.servicios as { nombre: string };
  const rango = turno.rango as string;
  const match = rango.match(/\[(.*?),(.*?)[)\]]/);
  const start = match?.[1];
  const end = match?.[2];

  const event = {
    summary: `${servicio.nombre} - ${cliente.nombre} ${cliente.apellido}`,
    description: turno.notas ?? '',
    start: { dateTime: start, timeZone: 'America/Argentina/Buenos_Aires' },
    end: { dateTime: end, timeZone: 'America/Argentina/Buenos_Aires' },
  };

  if (mapping) {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${mapping.evento_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const updated = await res.json();
    await supabase.from('turno_evento_gcal').update({ updated_at: new Date().toISOString() }).eq('turno_id', turnoId);
    return updated;
  }

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  const created = await res.json();
  if (created.id) {
    await supabase.from('turno_evento_gcal').upsert({
      turno_id: turnoId,
      evento_id: created.id,
      calendar_id: calendarId,
    });
  }
  return created;
}

Deno.serve(async (req) => {
  try {
    const { turno_id, action } = await req.json();
    if (!turno_id) return new Response(JSON.stringify({ error: 'turno_id requerido' }), { status: 400 });
    await syncTurno(turno_id, action ?? 'upsert');
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
