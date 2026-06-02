import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

async function sendTelegram(telegramId: number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramId, text }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  const { campana_id } = await req.json().catch(() => ({}));

  if (campana_id) {
    const { data: campana } = await supabase.from('campanas').select('*').eq('id', campana_id).maybeSingle();
    if (!campana) return new Response(JSON.stringify({ error: 'Campaña no encontrada' }), { status: 404 });

    await supabase.from('campanas').update({ estado: 'enviando' }).eq('id', campana_id);

    let query = supabase.from('telegram_suscriptores').select('telegram_id, cliente_id').eq('opt_in', true);
    if (campana.segmento === 'frecuentes') {
      const { data: top } = await supabase.rpc('obtener_clientes_frecuentes', { p_limite: 100 });
      const ids = (top ?? []).map((c: { cliente_id: string }) => c.cliente_id);
      if (ids.length) query = query.in('cliente_id', ids);
    } else if (campana.segmento === 'inactivos') {
      const { data: inact } = await supabase.rpc('obtener_clientes_inactivos', { p_dias: 90 });
      const ids = (inact ?? []).map((c: { cliente_id: string }) => c.cliente_id);
      if (ids.length) query = query.in('cliente_id', ids);
    }

    const { data: subs } = await query;
    for (const s of subs ?? []) {
      await supabase.from('campana_envios').upsert({
        campana_id,
        telegram_id: s.telegram_id,
        cliente_id: s.cliente_id,
        estado: 'pendiente',
      }, { onConflict: 'campana_id,telegram_id', ignoreDuplicates: true });
    }
  }

  const { data: pendientes } = await supabase
    .from('campana_envios')
    .select('id, telegram_id, campana_id, campanas(mensaje)')
    .eq('estado', 'pendiente')
    .limit(30);

  let enviados = 0;
  let fallidos = 0;

  for (const envio of pendientes ?? []) {
    const mensaje = (envio.campanas as { mensaje: string })?.mensaje ?? 'Promoción';
    const ok = await sendTelegram(envio.telegram_id, mensaje);
    await supabase.from('campana_envios').update({
      estado: ok ? 'enviado' : 'fallido',
      enviado_at: ok ? new Date().toISOString() : null,
      error: ok ? null : 'Error Telegram',
    }).eq('id', envio.id);

    if (ok) {
      enviados++;
      await supabase.rpc('increment_campana_enviados', { p_campana_id: envio.campana_id });
    } else {
      fallidos++;
      await supabase.rpc('increment_campana_fallidos', { p_campana_id: envio.campana_id });
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  return new Response(JSON.stringify({ enviados, fallidos, pendientes: pendientes?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
