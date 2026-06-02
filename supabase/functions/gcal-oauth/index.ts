import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function getGoogleOAuthConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const defaultRedirect = `${supabaseUrl}/functions/v1/gcal-oauth`;
  const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'google_oauth').maybeSingle();
  const stored = data?.valor as { client_id?: string; client_secret?: string; redirect_uri?: string } | null;

  return {
    clientId: Deno.env.get('GOOGLE_CLIENT_ID') ?? stored?.client_id,
    clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? stored?.client_secret,
    redirectUri: Deno.env.get('GOOGLE_REDIRECT_URI') ?? stored?.redirect_uri ?? defaultRedirect,
  };
}

function configErrorHtml(message: string) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Google Calendar</title></head>
<body style="font-family:sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem">
<h1>Google Calendar no configurado</h1><p>${message}</p>
<p>En el panel: <strong>Configuración → Google Calendar</strong>. En Google Cloud Console, agregá esta URI autorizada:</p>
<pre style="background:#f4f4f4;padding:0.75rem;overflow:auto">${Deno.env.get('SUPABASE_URL')}/functions/v1/gcal-oauth</pre>
</body></html>`;
}

Deno.serve(async (req) => {
  const { clientId, clientSecret, redirectUri } = await getGoogleOAuthConfig();
  const url = new URL(req.url);

  if (!clientId || !clientSecret) {
    return new Response(
      configErrorHtml('Faltan Client ID y Client Secret de Google OAuth.'),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  if (url.pathname.endsWith('/auth') || !url.searchParams.get('code')) {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    return Response.redirect(authUrl.toString(), 302);
  }

  const code = url.searchParams.get('code')!;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return new Response(
      `<pre>${JSON.stringify(tokens, null, 2)}</pre>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await supabase.from('google_calendar_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('google_calendar_tokens').insert({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
  });

  return new Response(
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body style="font-family:sans-serif;text-align:center;margin-top:3rem"><h1>Google Calendar conectado</h1><p>Pod\u00e9s cerrar esta ventana y volver al panel.</p></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
});
