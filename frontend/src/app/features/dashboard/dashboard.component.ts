import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthService } from '../../core/services/auth.service';
import { GcalService } from '../../core/services/gcal.service';
import { parseRango, TURNO_ESTADO_LABELS, Turno } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-dashboard',
  imports: [
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Panel</h1>
        <p class="subtitle">Resumen de turnos de hoy — {{ todayLabel }}</p>
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
      <mat-card class="stat-card">
        <mat-icon>check_circle</mat-icon>
        <div>
          <span class="stat-value">{{ confirmados() }}</span>
          <span class="stat-label">Confirmados</span>
        </div>
      </mat-card>
      <mat-card class="stat-card">
        <mat-icon>schedule</mat-icon>
        <div>
          <span class="stat-value">{{ pendientes() }}</span>
          <span class="stat-label">Pendientes</span>
        </div>
      </mat-card>
      <mat-card class="stat-card">
        <mat-icon>cancel</mat-icon>
        <div>
          <span class="stat-value">{{ cancelados() }}</span>
          <span class="stat-label">Cancelados</span>
        </div>
      </mat-card>
    </div>

    @if (auth.isAdmin()) {
      <mat-card class="admin-card">
        <h3>Integraciones</h3>
        <p>Conectá Google Calendar para sincronizar turnos confirmados.</p>
        <a mat-stroked-button [href]="gcal.getOAuthUrl()" target="_blank" rel="noopener">
          <mat-icon>calendar_month</mat-icon>
          Conectar Google Calendar
        </a>
      </mat-card>
    }

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
            <div class="turno-time">
              <strong>{{ getHora(turno) }}</strong>
            </div>
            <div class="turno-info">
              <h3>
                {{ turno.cliente?.nombre }} {{ turno.cliente?.apellido }}
              </h3>
              <p>{{ turno.servicio?.nombre }} · {{ turno.profesional?.nombre }} {{ turno.profesional?.apellido }}</p>
            </div>
            <mat-chip [class]="'estado-' + turno.estado">
              {{ estadoLabel(turno.estado) }}
            </mat-chip>
          </mat-card>
        }
      </div>
    }
  `,
  styles: `
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
      gap: 1rem;
      flex-wrap: wrap;

      h1 {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 600;
      }

      .subtitle {
        margin: 0.25rem 0 0;
        color: var(--app-text-muted);
      }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;

      mat-icon {
        color: var(--app-accent);
        font-size: 2rem;
        width: 2rem;
        height: 2rem;
      }

      .stat-value {
        display: block;
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 1.2;
      }

      .stat-label {
        color: var(--app-text-muted);
        font-size: 0.875rem;
      }
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 3rem;
    }

    .empty-card {
      text-align: center;
      padding: 3rem;

      mat-icon {
        font-size: 3rem;
        width: 3rem;
        height: 3rem;
        color: var(--app-text-muted);
      }
    }

    .admin-card {
      margin-bottom: 1.5rem;
      padding: 1.25rem;

      h3 { margin: 0 0 0.5rem; }
      p { margin: 0 0 1rem; color: var(--app-text-muted); }
    }

    .turnos-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .turno-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      flex-wrap: wrap;
    }

    .turno-time {
      min-width: 60px;
      font-size: 1.125rem;
    }

    .turno-info {
      flex: 1;

      h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 500;
      }

      p {
        margin: 0.25rem 0 0;
        color: var(--app-text-muted);
        font-size: 0.875rem;
      }
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  readonly auth = inject(AuthService);
  readonly gcal = inject(GcalService);

  readonly loading = signal(true);
  readonly turnos = signal<Turno[]>([]);
  readonly todayLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  confirmados = signal(0);
  pendientes = signal(0);
  cancelados = signal(0);

  ngOnInit(): void {
    void this.loadTurnos();
  }

  private async loadTurnos(): Promise<void> {
    this.loading.set(true);

    const hoy = new Date();
    const inicio = startOfDay(hoy).toISOString();
    const fin = endOfDay(hoy).toISOString();

    let query = this.supabase.client
      .from('turnos')
      .select(
        '*, cliente:clientes(nombre, apellido), profesional:profesionales(nombre, apellido), servicio:servicios(nombre, precio)',
      )
      .gte('rango', `[${inicio},)`)
      .lte('rango', `(,${fin}]`)
      .order('rango', { ascending: true });

    const profile = this.auth.profile();
    if (profile?.rol === 'profesional' && profile.profesional_id) {
      query = query.eq('profesional_id', profile.profesional_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      this.turnos.set([]);
    } else {
      const items = (data ?? []) as Turno[];
      this.turnos.set(items);
      this.confirmados.set(items.filter((t) => t.estado === 'confirmado').length);
      this.pendientes.set(items.filter((t) => ['reservado', 'reprogramado'].includes(t.estado)).length);
      this.cancelados.set(items.filter((t) => t.estado === 'cancelado').length);
    }

    this.loading.set(false);
  }

  getHora(turno: Turno): string {
    return format(parseRango(turno.rango).inicio, 'HH:mm');
  }

  estadoLabel(estado: Turno['estado']): string {
    return TURNO_ESTADO_LABELS[estado];
  }
}
