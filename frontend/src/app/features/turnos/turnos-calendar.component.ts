import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { addDays, format, startOfWeek, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthService } from '../../core/services/auth.service';
import { parseRango, TURNO_ESTADO_LABELS, Turno } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';
import { appDialogConfig } from '../../core/constants/dialog.config';
import { TurnoFormDialogComponent } from './turno-form-dialog.component';

@Component({
  selector: 'app-turnos-calendar',
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Turnos</h1>
        <p class="subtitle">Calendario semanal</p>
      </div>
      <button mat-flat-button color="primary" (click)="openForm()">
        <mat-icon>add</mat-icon>
        Reservar turno
      </button>
    </div>

    <div class="calendar-nav">
      <button mat-icon-button (click)="prevWeek()"><mat-icon>chevron_left</mat-icon></button>
      <span class="week-label">{{ weekLabel() }}</span>
      <button mat-icon-button (click)="nextWeek()"><mat-icon>chevron_right</mat-icon></button>
      <button mat-stroked-button (click)="goToday()">Hoy</button>
    </div>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <div class="calendar-grid">
        @for (day of weekDays(); track day.date) {
          <mat-card class="day-card">
            <div class="day-header">
              <strong>{{ day.label }}</strong>
              <small>{{ day.date | date: 'd MMM' }}</small>
            </div>
            <div class="day-turnos">
              @for (turno of turnosForDay(day.date); track turno.id) {
                <button class="turno-item estado-{{ turno.estado }}" (click)="openForm(turno)">
                  <span class="hora">{{ getHora(turno) }}</span>
                  <span class="cliente">{{ turno.cliente?.nombre }} {{ turno.cliente?.apellido }}</span>
                  <span class="servicio">{{ turno.servicio?.nombre }}</span>
                  <mat-chip class="estado-chip">{{ estadoLabel(turno.estado) }}</mat-chip>
                </button>
              } @empty {
                <p class="empty-day">Sin turnos</p>
              }
            </div>
          </mat-card>
        }
      </div>
    }
  `,
  styles: `
    .day-card {
      min-height: clamp(8rem, 20vw, 10rem);
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .day-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--app-border);
      display: flex;
      flex-direction: column;

      small { color: var(--app-text-muted); }
    }

    .day-turnos {
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      flex: 1;
      min-height: 0;
    }

    .turno-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
      width: 100%;
      min-height: var(--touch-min);
      padding: 0.625rem;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      background: var(--app-surface-hover);
      cursor: pointer;
      font: inherit;
      color: inherit;

      &:hover { border-color: var(--app-accent); }

      .hora { font-weight: 600; font-size: 0.8125rem; }
      .cliente { font-size: 0.8125rem; word-break: break-word; }
      .servicio { font-size: 0.75rem; color: var(--app-text-muted); word-break: break-word; }
      .estado-chip { margin-top: 0.25rem; font-size: 0.6875rem; height: auto; min-height: 1.5rem; }
    }

    .empty-day {
      text-align: center;
      color: var(--app-text-muted);
      font-size: 0.8125rem;
      padding: 1rem 0;
      margin: 0;
    }
  `,
})
export class TurnosCalendarComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly turnos = signal<Turno[]>([]);
  readonly weekStart = signal(startOfWeek(new Date(), { weekStartsOn: 1 }));

  readonly weekDays = signal<{ date: Date; label: string }[]>([]);
  readonly weekLabel = signal('');

  ngOnInit(): void {
    this.updateWeekDays();
    void this.loadTurnos();
  }

  private updateWeekDays(): void {
    const start = this.weekStart();
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return {
        date,
        label: format(date, 'EEEE', { locale: es }),
      };
    });
    this.weekDays.set(days);
    this.weekLabel.set(
      `${format(start, 'd MMM', { locale: es })} – ${format(addDays(start, 6), 'd MMM yyyy', { locale: es })}`,
    );
  }

  private async loadTurnos(): Promise<void> {
    this.loading.set(true);

    const start = this.weekStart();
    const end = addDays(start, 7);

    let query = this.supabase.client
      .from('turnos')
      .select(
        '*, cliente:clientes(nombre, apellido), profesional:profesionales(nombre, apellido), servicio:servicios(nombre, duracion_min)',
      )
      .gte('rango', `[${start.toISOString()},)`)
      .lt('rango', `[${end.toISOString()},)`)
      .order('rango', { ascending: true });

    const profile = this.auth.profile();
    if (profile?.rol === 'profesional' && profile.profesional_id) {
      query = query.eq('profesional_id', profile.profesional_id);
    }

    const { data, error } = await query;

    if (error) console.error(error);
    this.turnos.set((data ?? []) as Turno[]);
    this.loading.set(false);
  }

  turnosForDay(day: Date): Turno[] {
    const dayStr = format(day, 'yyyy-MM-dd');
    return this.turnos().filter((t) => {
      const inicio = parseRango(t.rango).inicio;
      return format(inicio, 'yyyy-MM-dd') === dayStr;
    });
  }

  getHora(turno: Turno): string {
    return format(parseRango(turno.rango).inicio, 'HH:mm');
  }

  estadoLabel(estado: Turno['estado']): string {
    return TURNO_ESTADO_LABELS[estado];
  }

  prevWeek(): void {
    this.weekStart.update((d) => subDays(d, 7));
    this.updateWeekDays();
    void this.loadTurnos();
  }

  nextWeek(): void {
    this.weekStart.update((d) => addDays(d, 7));
    this.updateWeekDays();
    void this.loadTurnos();
  }

  goToday(): void {
    this.weekStart.set(startOfWeek(new Date(), { weekStartsOn: 1 }));
    this.updateWeekDays();
    void this.loadTurnos();
  }

  openForm(turno?: Turno): void {
    const ref = this.dialog.open(TurnoFormDialogComponent, appDialogConfig({
      data: turno ?? null,
    }));

    ref.afterClosed().subscribe((saved) => {
      if (saved) void this.loadTurnos();
    });
  }
}
