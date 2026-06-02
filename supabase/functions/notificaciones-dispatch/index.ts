import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

interface ChannelAdapter {
  send(telegramId: number, content: string): Promise<boolean>;
}

const telegramAdapter: ChannelAdapter = {
  async send(telegramId, content) {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text: content }),
    });
    return res.ok;
  },
};

// WhatsApp adapter preparado (Meta Cloud API)
const whatsappAdapter: ChannelAdapter = {
  async send(_telegramId, _content) {
    console.log('WhatsApp adapter: no configurado');
    return false;
  },
};

// Email adapter preparado
const emailAdapter: ChannelAdapter = {
  async send(_telegramId, _content) {
    console.log('Email adapter: no configurado');
    return false;
  },
};

const adapters: Record<string, ChannelAdapter> = {
  telegram: telegramAdapter,
  whatsapp: whatsappAdapter,
  email: emailAdapter,
};

Deno.serve(async (_req) => {
  const now = new Date().toISOString();
  const { data: pendientes, error } = await supabase
    .from('notificaciones')
    .select('id, canal, contenido, clientes(telegram_id, email, telefono)')
    .eq('estado', 'pendiente')
    .lte('programada_para', now)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let enviadas = 0;
  for (const n of pendientes ?? []) {
    const cliente = n.clientes as { telegram_id?: number; email?: string; telefono?: string } | null;
    const adapter = adapters[n.canal];
    let ok = false;

    if (n.canal === 'telegram' && cliente?.telegram_id) {
      ok = await adapter.send(cliente.telegram_id, n.contenido ?? 'Notificación');
    } else if (n.canal === 'whatsapp' && cliente?.telefono) {
      ok = await adapter.send(0, n.contenido ?? '');
    } else if (n.canal === 'email' && cliente?.email) {
      ok = await adapter.send(0, n.contenido ?? '');
    }

    await supabase.from('notificaciones').update({
      estado: ok ? 'enviada' : 'fallida',
      enviada_at: ok ? now : null,
      error: ok ? null : 'Canal no disponible o destinatario faltante',
    }).eq('id', n.id);

    if (ok) enviadas++;
  }

  return new Response(JSON.stringify({ procesadas: pendientes?.length ?? 0, enviadas }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
