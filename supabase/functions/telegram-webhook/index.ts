import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface BotContexto {
  estado?: 'awaiting_nombre' | 'awaiting_apellido' | 'awaiting_confirmacion';
  telefono?: string;
  nombre?: string;
  pending_reserva?: {
    servicio_id: string;
    profesional_id: string;
    inicio: string;
  };
}

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
      description: 'Prepara una reserva (NO confirma sola). Usar solo después de ver_disponibilidad. El cliente debe confirmar con SI.',
      parameters: {
        type: 'object',
        properties: {
          servicio_id: { type: 'string' },
          profesional_id: { type: 'string' },
          inicio: { type: 'string', description: 'ISO8601 del slot elegido' },
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

async function configValue(clave: string): Promise<string | undefined> {
  const { data } = await supabase.from('configuracion').select('valor').eq('clave', clave).maybeSingle();
  return (data?.valor as { value?: string } | null)?.value;
}

async function getTelegramToken(): Promise<string> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? await configValue('edge_telegram_bot_token');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  return token;
}

async function getOpenRouterKey(): Promise<string | undefined> {
  return Deno.env.get('OPENROUTER_API_KEY') ?? await configValue('edge_openrouter_api_key');
}

async function getOpenRouterModel(): Promise<string> {
  return Deno.env.get('OPENROUTER_MODEL') ?? (await configValue('edge_openrouter_model')) ?? 'openai/gpt-4o-mini';
}

async function sendTelegram(chatId: number, text: string) {
  const token = await getTelegramToken();
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function getConversacion(telegramId: number) {
  const { data } = await supabase
    .from('conversaciones_bot')
    .select('cliente_id, historial, contexto')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return data;
}

async function saveConversacion(
  telegramId: number,
  patch: { cliente_id?: string | null; historial?: unknown[]; contexto?: BotContexto },
) {
  const existing = await getConversacion(telegramId);
  await supabase.from('conversaciones_bot').upsert({
    telegram_id: telegramId,
    cliente_id: patch.cliente_id !== undefined ? patch.cliente_id : existing?.cliente_id ?? null,
    historial: patch.historial ?? (existing?.historial as unknown[]) ?? [],
    contexto: patch.contexto ?? (existing?.contexto as BotContexto) ?? {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id' });
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

async function linkTelegramSuscriptor(telegramId: number, clienteId: string) {
  await supabase.from('telegram_suscriptores').upsert({
    telegram_id: telegramId,
    cliente_id: clienteId,
    opt_in: true,
    opt_out_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id' });
}

async function crearClienteDesdeTelegram(
  telegramId: number,
  telefono: string,
  nombre: string,
  apellido: string,
): Promise<string> {
  const { data: byTg } = await supabase.from('clientes').select('id').eq('telegram_id', telegramId).maybeSingle();
  if (byTg?.id) {
    await supabase.from('clientes').update({ nombre, apellido, telefono, activo: true, deleted_at: null })
      .eq('id', byTg.id);
    await linkTelegramSuscriptor(telegramId, byTg.id);
    return byTg.id;
  }

  const normalized = telefono.replace(/\D/g, '').slice(-10);
  const { data: byPhone } = await supabase.from('clientes').select('id')
    .or(`telefono.ilike.%${normalized}%,telefono.ilike.%${telefono}%`)
    .is('deleted_at', null).limit(1).maybeSingle();

  if (byPhone?.id) {
    await supabase.from('clientes').update({
      nombre, apellido, telefono, telegram_id: telegramId, activo: true,
    }).eq('id', byPhone.id);
    await linkTelegramSuscriptor(telegramId, byPhone.id);
    return byPhone.id;
  }

  const { data: created, error } = await supabase.from('clientes').insert({
    nombre,
    apellido,
    telefono,
    telegram_id: telegramId,
    activo: true,
  }).select('id').single();

  if (error || !created) throw new Error(error?.message ?? 'No se pudo crear el cliente');
  await linkTelegramSuscriptor(telegramId, created.id);
  return created.id;
}

async function buildReservaResumen(args: Record<string, unknown>) {
  const [{ data: serv }, { data: prof }] = await Promise.all([
    supabase.from('servicios').select('nombre,precio').eq('id', args.servicio_id).maybeSingle(),
    supabase.from('profesionales').select('nombre,apellido').eq('id', args.profesional_id).maybeSingle(),
  ]);
  const inicio = new Date(String(args.inicio));
  const fecha = inicio.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${serv?.nombre ?? 'Servicio'} con ${prof?.nombre ?? ''} ${prof?.apellido ?? ''}\n📅 ${fecha}\n💰 $${serv?.precio ?? '—'} ARS`;
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
      if (!clienteId) {
        return { error: 'El cliente debe compartir su contacto primero (📎 → Contacto) y completar nombre y apellido.' };
      }
      const resumen = await buildReservaResumen(args);
      const conv = await getConversacion(telegramId);
      const ctx = (conv?.contexto as BotContexto) ?? {};
      await saveConversacion(telegramId, {
        contexto: {
          ...ctx,
          estado: 'awaiting_confirmacion',
          pending_reserva: {
            servicio_id: String(args.servicio_id),
            profesional_id: String(args.profesional_id),
            inicio: String(args.inicio),
          },
        },
      });
      return {
        requiere_confirmacion: true,
        resumen,
        instruccion: 'Mostrá el resumen al cliente y pedile que responda SI para confirmar o NO para cancelar.',
      };
    }
    case 'mis_turnos': {
      if (!clienteId) return { error: 'Compartí tu contacto con /start para ver tus turnos.' };
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

async function confirmPendingBooking(chatId: number, telegramId: number, clienteId: string) {
  const conv = await getConversacion(telegramId);
  const ctx = (conv?.contexto as BotContexto) ?? {};
  const pending = ctx.pending_reserva;
  if (!pending) {
    await sendTelegram(chatId, 'No hay ninguna reserva pendiente.');
    return;
  }

  const { data: turnoId, error } = await supabase.rpc('reservar_turno', {
    p_cliente_id: clienteId,
    p_profesional_id: pending.profesional_id,
    p_servicio_id: pending.servicio_id,
    p_inicio: pending.inicio,
    p_origen: 'telegram',
  });

  const { pending_reserva: _, estado: __, ...rest } = ctx;
  await saveConversacion(telegramId, { contexto: rest });

  if (error) {
    await sendTelegram(chatId, `No pudimos confirmar el turno: ${error.message}`);
    return;
  }

  const resumen = await buildReservaResumen(pending);
  await sendTelegram(chatId, `✅ Turno confirmado (ID: ${turnoId})\n\n${resumen}`);
}

async function cancelPendingBooking(chatId: number, telegramId: number) {
  const conv = await getConversacion(telegramId);
  const ctx = (conv?.contexto as BotContexto) ?? {};
  const { pending_reserva: _, estado: __, ...rest } = ctx;
  await saveConversacion(telegramId, { contexto: rest });
  await sendTelegram(chatId, 'Reserva cancelada. Escribime si querés buscar otro horario.');
}

async function handleContact(chatId: number, phone: string, telegramId: number) {
  let clienteId = await getClienteId(telegramId);

  if (clienteId) {
    const { data: c } = await supabase.from('clientes').select('nombre').eq('id', clienteId).single();
    await linkTelegramSuscriptor(telegramId, clienteId);
    await sendTelegram(chatId, `¡Hola ${c?.nombre ?? ''}! Ya estás registrada/o. Podés consultar servicios y reservar turnos.`);
    return;
  }

  const normalized = phone.replace(/\D/g, '').slice(-10);
  const { data: cliente } = await supabase.from('clientes').select('id,nombre,apellido,telefono')
    .or(`telefono.ilike.%${normalized}%,telefono.ilike.%${phone}%`)
    .eq('activo', true).is('deleted_at', null).limit(1).maybeSingle();

  if (cliente) {
    await supabase.from('clientes').update({ telegram_id: telegramId }).eq('id', cliente.id);
    await linkTelegramSuscriptor(telegramId, cliente.id);
    await saveConversacion(telegramId, { cliente_id: cliente.id, contexto: {} });
    await sendTelegram(chatId, `¡Hola ${cliente.nombre}! Tu cuenta quedó vinculada. Podés reservar turnos escribiéndome.`);
    return;
  }

  await saveConversacion(telegramId, {
    contexto: { estado: 'awaiting_nombre', telefono: phone },
  });
  await sendTelegram(chatId, '¡Bienvenida/o! No te teníamos registrada.\n\n¿Cuál es tu nombre?');
}

async function handleRegistrationStep(chatId: number, telegramId: number, text: string): Promise<boolean> {
  const conv = await getConversacion(telegramId);
  const ctx = (conv?.contexto as BotContexto) ?? {};

  if (ctx.estado === 'awaiting_nombre') {
    const nombre = text.trim().split(/\s+/)[0];
    if (nombre.length < 2) {
      await sendTelegram(chatId, 'Por favor escribí tu nombre (mínimo 2 letras).');
      return true;
    }
    await saveConversacion(telegramId, {
      contexto: { ...ctx, estado: 'awaiting_apellido', nombre },
    });
    await sendTelegram(chatId, `Gracias ${nombre}. ¿Cuál es tu apellido?`);
    return true;
  }

  if (ctx.estado === 'awaiting_apellido') {
    const apellido = text.trim();
    if (apellido.length < 2) {
      await sendTelegram(chatId, 'Por favor escribí tu apellido.');
      return true;
    }
    if (!ctx.telefono || !ctx.nombre) {
      await sendTelegram(chatId, 'Compartí tu contacto de nuevo con 📎 → Contacto.');
      return true;
    }
    try {
      const clienteId = await crearClienteDesdeTelegram(telegramId, ctx.telefono, ctx.nombre, apellido);
      await saveConversacion(telegramId, { cliente_id: clienteId, contexto: {} });
      await sendTelegram(chatId, `¡Listo ${ctx.nombre}! Ya podés reservar turnos.\n\nEjemplo: "Quiero turno de manicura mañana"`);
    } catch (e) {
      await sendTelegram(chatId, `Error al registrarte: ${String(e)}`);
    }
    return true;
  }

  return false;
}

async function handleConfirmationStep(chatId: number, telegramId: number, text: string): Promise<boolean> {
  const conv = await getConversacion(telegramId);
  const ctx = (conv?.contexto as BotContexto) ?? {};
  if (ctx.estado !== 'awaiting_confirmacion' || !ctx.pending_reserva) return false;

  const t = text.trim().toLowerCase();
  if (/^(s[ií]|confirmo|dale|ok|yes|confirmar)$/.test(t)) {
    const clienteId = await getClienteId(telegramId);
    if (!clienteId) {
      await sendTelegram(chatId, 'Compartí tu contacto primero con 📎 → Contacto.');
      return true;
    }
    await confirmPendingBooking(chatId, telegramId, clienteId);
    return true;
  }
  if (/^(no|cancelar|cancel)$/.test(t)) {
    await cancelPendingBooking(chatId, telegramId);
    return true;
  }
  return false;
}

async function processWithAI(chatId: number, telegramId: number, text: string) {
  const openrouterKey = await getOpenRouterKey();
  if (!openrouterKey) {
    await sendTelegram(chatId, 'El asistente con IA aún no está configurado.');
    return;
  }

  const clienteId = await getClienteId(telegramId);
  if (!clienteId) {
    await sendTelegram(chatId, 'Para reservar turnos, primero compartí tu contacto (📎 → Contacto). Si sos nueva/o, te pediré nombre y apellido.');
    return;
  }

  const conv = await getConversacion(telegramId);
  const historial = (conv?.historial as Array<{ role: string; content: string }>) ?? [];
  const openrouterModel = await getOpenRouterModel();

  const systemPrompt = `Sos el asistente virtual de una estética en Argentina. Respondé en español rioplatense, breve y amable.
Usá SOLO datos de las herramientas para precios, horarios y disponibilidad. Nunca inventes.
Moneda: ARS. Zona horaria: America/Argentina/Buenos_Aires.
Flujo de reserva:
1) consultar_servicios / consultar_profesionales
2) ver_disponibilidad con servicio_id, profesional_id y fecha YYYY-MM-DD
3) reservar_turno con el slot elegido (ISO8601) — esto NO confirma, solo prepara
4) Mostrá el resumen y pedí que el cliente responda SI o NO
Nunca digas que el turno está confirmado hasta que el cliente confirme con SI.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historial.slice(-10),
    { role: 'user', content: text },
  ];

  let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('SUPABASE_URL') ?? 'https://appestetica.local',
      'X-Title': 'AppEstetica Bot',
    },
    body: JSON.stringify({ model: openrouterModel, messages, tools: TOOLS, tool_choice: 'auto' }),
  });

  let result = await response.json();
  if (result.error) {
    await sendTelegram(chatId, 'Error del asistente. Probá de nuevo en un momento.');
    return;
  }

  let choice = result.choices?.[0];
  let currentClienteId = clienteId;

  while (choice?.message?.tool_calls?.length) {
    messages.push(choice.message);
    for (const call of choice.message.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      const toolResult = await executeTool(call.function.name, args, telegramId, currentClienteId);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
    }
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SUPABASE_URL') ?? 'https://appestetica.local',
        'X-Title': 'AppEstetica Bot',
      },
      body: JSON.stringify({ model: openrouterModel, messages, tools: TOOLS }),
    });
    result = await response.json();
    choice = result.choices?.[0];
  }

  const reply = choice?.message?.content ?? 'No pude procesar tu consulta. Probá de nuevo.';
  historial.push({ role: 'user', content: text }, { role: 'assistant', content: reply });

  await saveConversacion(telegramId, {
    cliente_id: currentClienteId,
    historial: historial.slice(-20),
  });

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
    await sendTelegram(chatId, '¡Bienvenida/o a la estética! 👋\n\n1️⃣ Compartí tu contacto (📎 → Contacto)\n2️⃣ Si sos nueva/o, te pediré nombre y apellido\n3️⃣ Después podés reservar turnos en lenguaje natural\n\nEj: "Quiero turno de manicura el viernes"\n\n/stop para no recibir promociones.');
    await supabase.from('telegram_suscriptores').upsert({ telegram_id: telegramId, opt_in: false }, { onConflict: 'telegram_id' });
    return new Response('OK');
  }

  if (text === '/stop') {
    await supabase.from('telegram_suscriptores').upsert({
      telegram_id: telegramId,
      opt_in: false,
      opt_out_at: new Date().toISOString(),
    }, { onConflict: 'telegram_id' });
    await sendTelegram(chatId, 'Dejaste de recibir promociones. Podés seguir reservando turnos.');
    return new Response('OK');
  }

  if (text.startsWith('/')) {
    await sendTelegram(chatId, 'Escribime en lenguaje natural o usá /start.');
    return new Response('OK');
  }

  if (await handleRegistrationStep(chatId, telegramId, text)) return new Response('OK');
  if (await handleConfirmationStep(chatId, telegramId, text)) return new Response('OK');

  await processWithAI(chatId, telegramId, text);
  return new Response('OK');
});
