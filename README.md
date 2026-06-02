# AppEstetica

Plataforma de gestión para estética profesional (Argentina).

## Stack

- **Frontend**: Angular (standalone, Signals, Angular Material)
- **Backend**: Supabase (`wxiifdjerstsrrbvmuvh`) — PostgreSQL, Auth, Storage, Edge Functions
- **Integraciones**: Telegram Bot + OpenRouter (IA), Google Calendar

## Requisitos

- Node.js 20+
- npm 10+
- Cuenta Supabase (proyecto configurado)
- Secrets en Supabase Dashboard → Edge Functions → Secrets

## Configuración local

1. Copiar `.env.example` a `.env` (solo referencia; el frontend usa `environment.ts`).

2. Instalar y levantar:

```bash
cd frontend
npm install
npm start
```

3. Crear usuario admin en Supabase Auth y actualizar su fila en `profiles` con `rol = 'admin'`.

## Secrets de Edge Functions (Supabase Dashboard)

| Secret | Uso |
|--------|-----|
| `TELEGRAM_BOT_TOKEN` | Bot de Telegram |
| `OPENROUTER_API_KEY` | IA conversacional |
| `OPENROUTER_MODEL` | Opcional, default `openai/gpt-4o-mini` |
| `GOOGLE_CLIENT_ID` | Google Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth |
| `GOOGLE_REDIRECT_URI` | URL callback → `.../functions/v1/gcal-oauth` |

## Edge Functions desplegadas

| Función | Descripción |
|---------|-------------|
| `telegram-webhook` | Webhook del bot con IA y tool-calling |
| `gcal-sync` | Sincroniza turnos con Google Calendar |
| `gcal-oauth` | OAuth para conectar cuenta Google |
| `notificaciones-dispatch` | Envía cola de notificaciones (Telegram/Email/WhatsApp) |

### Telegram webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://wxiifdjerstsrrbvmuvh.supabase.co/functions/v1/telegram-webhook"
```

### Cron de notificaciones

Programar invocación cada 5 minutos a `notificaciones-dispatch` (Supabase Cron o servicio externo).

## Google Calendar

1. Admin → Panel → **Conectar Google Calendar**
2. Asignar `google_calendar_id` a cada profesional en la base de datos

## Repositorio GitHub

Repo privado: **AppEstetica**

```bash
# Crear repo en GitHub y conectar:
git remote add origin https://github.com/<usuario>/AppEstetica.git
git push -u origin main
```

## Estructura

```
AppEstetica/
├── frontend/          # App Angular
├── supabase/          # Migraciones y Edge Functions
├── .github/workflows/ # CI
└── README.md
```

## Roles

- **Administrador**: acceso total + integraciones
- **Recepción**: clientes, turnos, servicios
- **Profesional**: su agenda y turnos asignados

## Licencia

Privado — uso interno del negocio.
