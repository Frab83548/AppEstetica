export type UserRole = 'admin' | 'recepcion' | 'profesional';

export type TurnoEstado =
  | 'reservado'
  | 'confirmado'
  | 'cancelado'
  | 'reprogramado'
  | 'completado'
  | 'no_show';

export type TurnoOrigen = 'panel' | 'telegram';

export type AusenciaTipo = 'vacacion' | 'licencia' | 'ausencia';

export type PromocionTipo = 'porcentaje' | 'monto_fijo';

export interface Profile {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  profesional_id: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  fecha_nacimiento: string | null;
  email: string | null;
  telefono: string | null;
  telegram_id: number | null;
  observaciones: string | null;
  preferencias: Record<string, unknown>;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Servicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  precio: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Promocion {
  id: string;
  servicio_id: string | null;
  nombre: string;
  tipo: PromocionTipo;
  valor: number;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  especialidades: string[];
  activo: boolean;
  google_calendar_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ServicioProfesional {
  servicio_id: string;
  profesional_id: string;
}

export interface HorarioLaboral {
  id: string;
  profesional_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export interface Ausencia {
  id: string;
  profesional_id: string;
  tipo: AusenciaTipo;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
  created_at: string;
}

export interface Turno {
  id: string;
  cliente_id: string;
  profesional_id: string;
  servicio_id: string;
  rango: string;
  estado: TurnoEstado;
  origen: TurnoOrigen;
  notas: string | null;
  created_at: string;
  updated_at: string;
  cliente?: Cliente;
  profesional?: Profesional;
  servicio?: Servicio;
}

export interface SlotDisponible {
  slot_inicio: string;
  slot_fin: string;
}

export interface Cobro {
  id: string;
  turno_id: string | null;
  cliente_id: string;
  monto: number;
  medio: string | null;
  fecha: string;
  notas: string | null;
  created_at: string;
}

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export const TURNO_ESTADO_LABELS: Record<TurnoEstado, string> = {
  reservado: 'Reservado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  reprogramado: 'Reprogramado',
  completado: 'Completado',
  no_show: 'No asistió',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  recepcion: 'Recepción',
  profesional: 'Profesional',
};

/** Parse Postgres tstzrange string into start/end ISO dates. */
export function parseRango(rango: string): { inicio: Date; fin: Date } {
  const cleaned = rango.replace(/[\[\]()]/g, '');
  const [start, end] = cleaned.split(',');
  return { inicio: new Date(start.trim()), fin: new Date(end.trim()) };
}
