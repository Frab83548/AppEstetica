import { CurrencyPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { endOfMonth, format, startOfMonth, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthService } from '../../core/services/auth.service';
import { GcalService } from '../../core/services/gcal.service';
import { parseRango, TURNO_ESTADO_LABELS, Turno } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

interface TopItem {
  nombre: string;
  cantidad?: number;
  visitas?: number;
}

interface DashboardStats {
  facturacion_mes: number;
  turnos_periodo: number;
  cancelaciones: number;
  ocupacion_pct: number;
  servicios_top: TopItem[];
  profesionales_top: TopItem[];
  clientes_frecuentes: TopItem[];
}

@Component({
  selector: 'app-dashboard',
  imports: [
    CurrencyPipe,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatListModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Panel</h1>
        <p class="subtitle">{{ todayLabel }} · Mes actual</p>
      </div>
      <a mat-flat-button color="primary" routerLink="/turnos">
        <mat-icon>add</mat-icon>
        Nuevo turno
      </a>
    </div>

    <div class="stats-grid">
      <mat-card class="stat-card">
        <mat-icon>event</mat-icon>
        <div>
          <span class="stat-value">{{ turnos().length }}</span>
          <span class="stat-label">Turnos hoy</span>
        </div>
      </mat-card>
      <mat-card class="stat-card highlight">
        <mat-icon>payments</mat-icon>
        <div>
          <span class="stat-value">{{ stats()?.facturacion_mes | currency:'ARS':'symbol-narrow':'1.0-0' }}</span>
          <span class="stat-label">Facturación del mes</span>
        </div>
      </mat-card>
      <mat-card class="stat-card">
        <mat-icon>pie_chart</mat-icon>
        <div>
          <span class="stat-value">{{ stats()?.ocupacion_pct ?? 0 }}%</span>
          <span class="stat-label">Ocupación</span>
        </div>
      </mat-card>
      <mat-card class="stat-card">
        <mat-icon>cancel</mat-icon>
        <div>
          <span class="stat-value">{{ stats()?.cancelaciones ?? 0 }}</span>
          <span class="stat-label">Cancelaciones (mes)</span>
        </div>
      </mat-card>
    </div>

    <div class="charts-grid">
      <mat-card class="chart-card">
        <h3>Servicios más vendidos</h3>
        @if ((stats()?.servicios_top?.length ?? 0) === 0) {
          <p class="muted">Sin datos en el período</p>
        } @else {
          <mat-list>
            @for (s of stats()?.servicios_top ?? []; track s.nombre) {
              <mat-list-item>
                <span matListItemTitle>{{ s.nombre }}</span>
                <span matListItemLine>{{ s.cantidad }} turnos</span>
              </mat-list-item>
            }
          </mat-list>
        }
      </mat-card>

      <mat-card class="chart-card">
        <h3>Profesionales más solicitados</h3>
        @if ((stats()?.profesionales_top?.length ?? 0) === 0) {
          <p class="muted">Sin datos en el período</p>
        } @else {
          <mat-list>
            @for (p of stats()?.profesionales_top ?? []; track p.nombre) {
              <mat-list-item>
                <span matListItemTitle>{{ p.nombre }}</span>
                <span matListItemLine>{{ p.cantidad }} turnos</span>
              </mat-list-item>
            }
          </mat-list>
        }
      </mat-card>

      <mat-card class="chart-card">
        <h3>Clientes frecuentes</h3>
        @if ((stats()?.clientes_frecuentes?.length ?? 0) === 0) {
          <p class="muted">Sin datos en el período</p>
        } @else {
          <mat-list>
            @for (c of stats()?.clientes_frecuentes ?? []; track c.nombre) {
              <mat-list-item>
                <span matListItemTitle>{{ c.nombre }}</span>
                <span matListItemLine>{{ c.visitas }} visitas</span>
              </mat-list-item>
            }
          </mat-list>
        }
      </mat-card>
    </div>

    @if (auth.isAdmin()) {
      <mat-card class="admin-card">
        <h3>Integraciones · Google Calendar</h3>
        @if (gcalConnected()) {
          <p class="status-ok"><mat-icon>check_circle</mat-icon> Google Calendar conectado.</p>
          @if (!gcalProfesionalesOk()) {
            <p class="status-warn">Falta Calendar ID en algún profesional → <a routerLink="/personal">Personal</a></p>
          } @else {
            <p class="muted">Los turnos se sincronizan al calendario de cada profesional.</p>
          }
          <div class="admin-actions">
            <a mat-stroked-button routerLink="/configuracion">Ver configuración</a>
            <button mat-stroked-button (click)="desconectarGcal()">Desconectar</button>
          </div>
        } @else if (!gcalConfigured()) {
          <p>Primero cargá las credenciales OAuth en <a routerLink="/configuracion">Configuración</a>.</p>
          <a mat-stroked-button routerLink="/configuracion">
            <mat-icon>settings</mat-icon>
            Ir a Configuración
          </a>
        } @else {
          <p>Credenciales listas. Autorizá la cuenta Google del negocio (paso 2).</p>
          <div class="admin-actions">
            <a mat-flat-button color="primary" [href]="gcal.getOAuthUrl()" target="_blank" rel="noopener">
              <mat-icon>calendar_month</mat-icon>
              Conectar Google Calendar
            </a>
            <a mat-stroked-button routerLink="/configuracion">Guía completa</a>
          </div>
        }
      </mat-card>
    }

    <h2 class="section-title">Turnos de hoy</h2>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else if (turnos().length === 0) {
      <mat-card class="empty-card">
        <mat-icon>event_busy</mat-icon>
        <p>No hay turnos programados para hoy</p>
        <a mat-stroked-button routerLink="/turnos">Ver calendario</a>
      </mat-card>
    } @else {
      <div class="turnos-list">
        @for (turno of turnos(); track turno.id) {
          <mat-card class="turno-card">
            <div class="turno-time"><strong>{{ getHora(turno) }}</strong></div>
            <div class="turno-info">
              <h3>{{ turno.cliente?.nombre }} {{ turno.cliente?.apellido }}</h3>
              <p>{{ turno.servicio?.nombre }} · {{ turno.profesional?.nombre }} {{ turno.profesional?.apellido }}</p>
            </div>
            <mat-chip [class]="'estado-' + turno.estado">{{ estadoLabel(turno.estado) }}</mat-chip>
          </mat-card>
        }
      </div>
    }
  `,
  styles: `
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
    .page-header h1 { margin: 0; font-size: 1.75rem; font-weight: 600; }
    .subtitle { margin: 0.25rem 0 0; color: var(--app-text-muted); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card, .chart-card { padding: 1.25rem; }
    .stat-card { display: flex; align-items: center; gap: 1rem; }
    .stat-card.highlight mat-icon { color: #2e7d32; }
    .stat-card mat-icon { color: var(--app-accent); font-size: 2rem; width: 2rem; height: 2rem; }
    .stat-value { display: block; font-size: 1.5rem; font-weight: 600; }
    .stat-label { color: var(--app-text-muted); font-size: 0.875rem; }
    .chart-card h3 { margin: 0 0 0.75rem; font-size: 1rem; }
    .muted { color: var(--app-text-muted); margin: 0; }
    .section-title { font-size: 1.125rem; margin: 0 0 1rem; }
    .admin-card { margin-bottom: 1.5rem; padding: 1.25rem; }
    .admin-card h3 { margin: 0 0 0.5rem; }
    .admin-card p { margin: 0 0 1rem; color: var(--app-text-muted); }
    .status-ok { display: flex; align-items: center; gap: 0.35rem; color: #2e7d32; }
    .status-warn { color: #e65100; margin: 0 0 1rem; font-size: 0.9rem; }
    .status-ok mat-icon { font-size: 1.25rem; width: 1.25rem; height: 1.25rem; }
    .admin-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .loading { display: flex; justify-content: center; padding: 3rem; }
    .empty-card { text-align: center; padding: 3rem; }
    .turnos-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .turno-card { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; flex-wrap: wrap; }
    .turno-time { min-width: 60px; font-size: 1.125rem; }
    .turno-info { flex: 1; }
    .turno-info h3 { margin: 0; font-size: 1rem; font-weight: 500; }
    .turno-info p { margin: 0.25rem 0 0; color: var(--app-text-muted); font-size: 0.875rem; }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  readonly auth = inject(AuthService);
  readonly gcal = inject(GcalService);

  readonly loading = signal(true);
  readonly turnos = signal<Turno[]>([]);
  readonly stats = signal<DashboardStats | null>(null);
  readonly gcalConnected = signal(false);
  readonly gcalConfigured = signal(false);
  readonly gcalProfesionalesOk = signal(false);
  readonly todayLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  ngOnInit(): void {
    void this.load();
    if (this.auth.isAdmin()) void this.loadGcalStatus();
  }

  private async loadGcalStatus(): Promise<void> {
    const status = await this.gcal.getSetupStatus();
    this.gcalConnected.set(status.accountConnected);
    this.gcalConfigured.set(status.credentialsConfigured);
    this.gcalProfesionalesOk.set(
      status.professionalsTotal > 0 && status.professionalsWithCalendar === status.professionalsTotal,
    );
  }

  async desconectarGcal(): Promise<void> {
    await this.gcal.disconnect();
    this.gcalConnected.set(false);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const hoy = new Date();
    const inicio = startOfDay(hoy).toISOString();
    const fin = endOfDay(hoy).toISOString();
    const mesInicio = format(startOfMonth(hoy), 'yyyy-MM-dd');
    const mesFin = format(endOfMonth(hoy), 'yyyy-MM-dd');

    const statsPromise = this.supabase.client.rpc('obtener_dashboard_stats', {
      p_desde: mesInicio,
      p_hasta: mesFin,
    });

    let query = this.supabase.client
      .from('turnos')
      .select('*, cliente:clientes(nombre, apellido), profesional:profesionales(nombre, apellido), servicio:servicios(nombre, precio)')
      .gte('rango', `[${inicio},)`)
      .lte('rango', `(,${fin}]`)
      .order('rango', { ascending: true });

    const profile = this.auth.profile();
    if (profile?.rol === 'profesional' && profile.profesional_id) {
      query = query.eq('profesional_id', profile.profesional_id);
    }

    const [{ data, error }, { data: statsData }] = await Promise.all([query, statsPromise]);

    if (error) this.turnos.set([]);
    else this.turnos.set((data ?? []) as Turno[]);

    this.stats.set((statsData as DashboardStats) ?? null);
    this.loading.set(false);
  }

  getHora(turno: Turno): string {
    return format(parseRango(turno.rango).inicio, 'HH:mm');
  }

  estadoLabel(estado: Turno['estado']): string {
    return TURNO_ESTADO_LABELS[estado];
  }
}
