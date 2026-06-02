# AppEstetica

Plataforma de gestión para estética profesional (Argentina).

## Stack

- **Frontend**: Angular (standalone, Signals, Angular Material)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Integraciones**: Telegram Bot + OpenRouter (IA), Google Calendar

## Requisitos

- Node.js 20+
- npm 10+
- Cuenta Supabase
- Supabase CLI (opcional, para desarrollo local)

## Configuración

1. Copiar `.env.example` a `.env` y completar variables.
2. Instalar dependencias del frontend:

```bash
cd frontend
npm install
```

3. Levantar en desarrollo:

```bash
npm start
```

4. Aplicar migraciones Supabase (desde la raíz del proyecto):

```bash
supabase db push
```

## Estructura

```
AppEstetica/
├── frontend/          # App Angular
├── supabase/          # Migraciones, Edge Functions, config
└── README.md
```

## Roles

- **Administrador**: acceso total
- **Recepción**: clientes, turnos, servicios
- **Profesional**: su agenda y turnos asignados

## Licencia

Privado — uso interno del negocio.
