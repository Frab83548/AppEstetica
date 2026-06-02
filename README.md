# AppEstetica

Plataforma de gestión para estética profesional (Argentina).

## Stack

- **Frontend**: Angular (standalone, Signals, Angular Material)
- **Backend**: Supabase (`wxiifdjerstsrrbvmuvh`) — PostgreSQL, Auth, Storage, Edge Functions
- **Integraciones**: Telegram Bot + OpenRouter (IA), Google Calendar

## Módulos

| Módulo | Descripción |
|--------|-------------|
| Panel | KPIs: facturación, ocupación, tops de servicios/profesionales/clientes |
| Turnos | Calendario, reserva, reprogramación, anti-solapamiento |
| Clientes | CRUD, baja lógica, historial de cambios |
| Servicios | CRUD, promociones, asignación a profesionales |
| Personal | Horarios, ausencias, Google Calendar ID |
| Cobros | Registro interno de ingresos |
| Reportes | Export PDF / Excel con filtros |
| Marketing | Campañas Telegram opt-in con segmentación |
| Configuración | Política de cancelación / no-show |

## Requisitos

- Node.js 20+
- npm 10+

## Configuración local

```bash
cd frontend
npm install
npm start
```

Crear usuario en Supabase Auth y asignar rol en `profiles` (`admin`, `recepcion`, `profesional`).

## Secrets Edge Functions (Supabase Dashboard)

| Secret | Uso |
|--------|-----|
| `TELEGRAM_BOT_TOKEN` | Bot + campañas + notificaciones |
| `OPENROUTER_API_KEY` | IA conversacional |
| `OPENROUTER_MODEL` | Opcional (`openai/gpt-4o-mini`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google Calendar |

## Edge Functions

- `telegram-webhook` — Bot IA con tool-calling
- `gcal-sync` / `gcal-oauth` — Google Calendar
- `notificaciones-dispatch` — Cola de notificaciones (cron cada 5 min)
- `campanas-dispatch` — Difusión marketing opt-in

### Webhook Telegram

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://wxiifdjerstsrrbvmuvh.supabase.co/functions/v1/telegram-webhook"
```

### Cron notificaciones

Programar POST a `notificaciones-dispatch` cada 5 minutos (Supabase Cron o servicio externo).

## GitHub

Repo privado: **AppEstetica**

```bash
gh auth login
gh repo create AppEstetica --private --source=. --remote=origin --push
```

## Roles

- **Administrador**: acceso total + marketing + configuración
- **Recepción**: clientes, turnos, servicios, cobros, reportes
- **Profesional**: su agenda

## Licencia

Privado — uso interno del negocio.
