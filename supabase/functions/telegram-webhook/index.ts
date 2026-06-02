import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY')!;
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'openai/gpt-4o-mini';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    contact?: { phone_number: string; user_id: number };
  };
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consultar_servicios',
      description: 'Lista servicios activos con precio y duración',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_promociones',
      description: 'Lista promociones vigentes',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_profesionales',
      description: 'Lista profesionales activos',
      parameters: { type: 'object', properties: { servicio_id: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_disponibilidad',
      description: 'Horarios libres para un servicio y fecha',
      parameters: {
        type: 'object',
        properties: {
          servicio_id: { type: 'string' },
          profesional_id: { type: 'string' },
          fecha: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['servicio_id', 'profesional_id', 'fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reservar_turno',
      description: 'Reserva un turno confirmado',
      parameters: {
        type: 'object',
        properties: {
          servicio_id: { type: 'string' },
          profesional_id: { type: 'string' },
          inicio: { type: 'string', description: 'ISO8601' },
        },
        required: ['servicio_id', 'profesional_id', 'inicio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mis_turnos',
      description: 'Turnos futuros del cliente',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_turno',
      description: 'Cancela un turno por id',
      parameters: {
        type: 'object',
        properties: { turno_id: { type: 'string' } },
        required: ['turno_id'],
      },
    },
  },
];

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function getClienteId(telegramId: number): Promise<string | null> {
  const { data } = await supabase
    .from('clientes')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('activo', true)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

async function executeTool(name: string, args: Record<string, unknown>, telegramId: number, clienteId: string | null) {
  switch (name) {
    case 'consultar_servicios': {
      const { data } = await supabase.from('servicios').select('id,nombre,precio,duracion_min,descripcion').eq('activo', true).is('deleted_at', null);
      return data ?? [];
    }
    case 'consultar_promociones': {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from('promociones').select('*, servicios(nombre)').eq('activo', true)
        .or(`vigencia_desde.is.null,vigencia_desde.lte.${today}`)
        .or(`vigencia_hasta.is.null,vigencia_hasta.gte.${today}`);
      return data ?? [];
    }
    case 'consultar_profesionales': {
      let query = supabase.from('profesionales').select('id,nombre,apellido,especialidades').eq('activo', true).is('deleted_at', null);
      if (args.servicio_id) {
        const { data: links } = await supabase.from('servicio_profesional').select('profesional_id').eq('servicio_id', args.servicio_id);
        const ids = (links ?? []).map((l) => l.profesional_id);
        if (ids.length) query = query.in('id', ids);
      }
      const { data } = await query;
      return data ?? [];
    }
    case 'ver_disponibilidad': {
      const { data, error } = await supabase.rpc('obtener_slots_disponibles', {
        p_profesional_id: args.profesional_id,
        p_servicio_id: args.servicio_id,
        p_fecha: args.fecha,
      });
      if (error) return { error: error.message };
      return data ?? [];
    }
    case 'reservar_turno': {
      if (!clienteId) return { error: 'Debes vincular tu teléfono con /start y compartir contacto.' };
      const { data, error } = await supabase.rpc('reservar_turno', {
        p_cliente_id: clienteId,
        p_profesional_id: args.profesional_id,
        p_servicio_id: args.servicio_id,
        p_inicio: args.inicio,
        p_origen: 'telegram',
      });
      if (error) return { error: error.message };
      return { turno_id: data };
    }
    case 'mis_turnos': {
      if (!clienteId) return { error: 'Cliente no vinculado.' };
      const { data } = await supabase.from('turnos').select('id,rango,estado,servicios(nombre),profesionales(nombre,apellido)')
        .eq('cliente_id', clienteId).in('estado', ['reservado', 'confirmado', 'reprogramado']).gte('rango', `[${new Date().toISOString()},)`);
      return data ?? [];
    }
    case 'cancelar_turno': {
      if (!clienteId) return { error: 'Cliente no vinculado.' };
      const { data: turno } = await supabase.from('turnos').select('id').eq('id', args.turno_id).eq('cliente_id', clienteId).maybeSingle();
      if (!turno) return { error: 'Turno no encontrado.' };
      const { data, error } = await supabase.rpc('cancelar_turno', { p_turno_id: args.turno_id });
      if (error) return { error: error.message };
      return { ok: true, turno_id: data };
    }
    default:
      return { error: 'Herramienta desconocida' };
  }
}

async function handleContact(chatId: number, phone: string, telegramId: number) {
  const normalized = phone.replace(/\D/g, '').slice(-10);
  const { data: cliente } = await supabase.from('clientes').select('id,nombre,telefono')
    .or(`telefono.ilike.%${normalized}%,telefono.ilike.%${phone}%`)
    .eq('activo', true).is('deleted_at', null).limit(1).maybeSingle();

  if (!cliente) {
    await sendTelegram(chatId, 'No encontramos tu teléfono en nuestros registros. Contactá a recepción para darte de alta.');
    return;
  }

  await supabase.from('clientes').update({ telegram_id: telegramId }).eq('id', cliente.id);
  await supabase.from('telegram_suscriptores').upsert({
    telegram_id: telegramId,
    cliente_id: cliente.id,
    opt_in: true,
    opt_out_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id' });

  await sendTelegram(chatId, `¡Hola ${cliente.nombre}! Tu cuenta quedó vinculada. Podés consultar servicios, precios y reservar turnos.`);
}

async function processWithAI(chatId: number, telegramId: number, text: string) {
  const clienteId = await getClienteId(telegramId);

  const { data: conv } = await supabase.from('conversaciones_bot').select('historial').eq('telegram_id', telegramId).maybeSingle();
  const historial = (conv?.historial as Array<{ role: string; content: string }>) ?? [];

  const systemPrompt = `Sos el asistente virtual de una estética en Argentina. Respondé en español rioplatense, breve y amable.
Usá SOLO datos de las herramientas para precios, horarios y disponibilidad. Nunca inventes.
Moneda: ARS. Zona horaria: America/Argentina/Buenos_Aires.
Para reservar necesitás servicio_id, profesional_id e inicio ISO8601 confirmados por ver_disponibilidad.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historial.slice(-10),
    { role: 'user', content: text },
  ];

  let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, tools: TOOLS, tool_choice: 'auto' }),
  });

  let result = await response.json();
  let choice = result.choices?.[0];

  while (choice?.message?.tool_calls?.length) {
    messages.push(choice.message);
    for (const call of choice.message.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      const toolResult = await executeTool(call.function.name, args, telegramId, clienteId);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
    }
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages, tools: TOOLS }),
    });
    result = await response.json();
    choice = result.choices?.[0];
  }

  const reply = choice?.message?.content ?? 'No pude procesar tu consulta. Probá de nuevo.';
  historial.push({ role: 'user', content: text }, { role: 'assistant', content: reply });

  await supabase.from('conversaciones_bot').upsert({
    telegram_id: telegramId,
    cliente_id: clienteId,
    historial: historial.slice(-20),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id' });

  await sendTelegram(chatId, reply);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK');

  const update: TelegramUpdate = await req.json();
  const msg = update.message;
  if (!msg) return new Response('OK');

  const chatId = msg.chat.id;
  const telegramId = chatId;

  if (msg.contact) {
    await handleContact(chatId, msg.contact.phone_number, telegramId);
    return new Response('OK');
  }

  const text = msg.text?.trim() ?? '';

  if (text === '/start') {
    await sendTelegram(chatId, '¡Bienvenida/o! Compartí tu contacto (📎 → Contacto) para vincular tu cuenta.\n\nTambién podés escribirme en lenguaje natural, por ejemplo:\n• "Quiero turno de manicura mañana"\n• "¿Qué promociones hay?"\n\n/stop para dejar de recibir promociones.');
    await supabase.from('telegram_suscriptores').upsert({ telegram_id: telegramId, opt_in: false }, { onConflict: 'telegram_id' });
    return new Response('OK');
  }

  if (text === '/stop') {
    await supabase.from('telegram_suscriptores').upsert({
      telegram_id: telegramId,
      opt_in: false,
      opt_out_at: new Date().toISOString(),
    }, { onConflict: 'telegram_id' });
    await sendTelegram(chatId, 'Dejaste de recibir promociones. Podés seguir gestionando turnos.');
    return new Response('OK');
  }

  if (text.startsWith('/')) {
    await sendTelegram(chatId, 'Escribime en lenguaje natural o usá /start para vincular tu cuenta.');
    return new Response('OK');
  }

  await processWithAI(chatId, telegramId, text);
  return new Response('OK');
});
