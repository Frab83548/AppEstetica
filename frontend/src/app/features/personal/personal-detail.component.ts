import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Ausencia,
  AusenciaTipo,
  DIAS_SEMANA,
  HorarioLaboral,
  Profesional,
  Servicio,
} from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-personal-detail',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  template: `
    <a mat-button routerLink="/personal"><mat-icon>arrow_back</mat-icon> Volver</a>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else if (profesional()) {
      <div class="header">
        <h1>{{ profesional()!.nombre }} {{ profesional()!.apellido }}</h1>
        <p class="muted">{{ profesional()!.email }} · {{ profesional()!.telefono }}</p>
      </div>

      <mat-tab-group>
        <mat-tab label="Horarios">
          <div class="tab-content">
            <form [formGroup]="horarioForm" class="inline-form-responsive">
              <mat-form-field appearance="outline">
                <mat-label>Día</mat-label>
                <mat-select formControlName="dia_semana">
                  @for (dia of dias; track $index) {
                    <mat-option [value]="$index">{{ dia }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Inicio</mat-label>
                <input matInput type="time" formControlName="hora_inicio" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Fin</mat-label>
                <input matInput type="time" formControlName="hora_fin" />
              </mat-form-field>
              <button mat-stroked-button type="button" (click)="addHorario()">Agregar</button>
            </form>

            <div class="table-container">
            <table mat-table [dataSource]="horarios()" class="data-table responsive-table">
              <ng-container matColumnDef="dia">
                <th mat-header-cell *matHeaderCellDef>Día</th>
                <td mat-cell *matCellDef="let h" data-label="Día">{{ dias[h.dia_semana] }}</td>
              </ng-container>
              <ng-container matColumnDef="horario">
                <th mat-header-cell *matHeaderCellDef>Horario</th>
                <td mat-cell *matCellDef="let h" data-label="Horario">{{ h.hora_inicio }} – {{ h.hora_fin }}</td>
              </ng-container>
              <ng-container matColumnDef="acciones">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let h" data-label="">
                  <div class="cell-actions">
                  <button mat-icon-button color="warn" (click)="deleteHorario(h)">
                    <mat-icon>delete</mat-icon>
                  </button>
                  </div>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="horarioColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: horarioColumns"></tr>
            </table>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Ausencias">
          <div class="tab-content">
            <form [formGroup]="ausenciaForm" class="inline-form-responsive">
              <mat-form-field appearance="outline">
                <mat-label>Tipo</mat-label>
                <mat-select formControlName="tipo">
                  <mat-option value="vacacion">Vacaciones</mat-option>
                  <mat-option value="licencia">Licencia</mat-option>
                  <mat-option value="ausencia">Ausencia</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Desde</mat-label>
                <input matInput type="datetime-local" formControlName="fecha_inicio" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Hasta</mat-label>
                <input matInput type="datetime-local" formControlName="fecha_fin" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Motivo</mat-label>
                <input matInput formControlName="motivo" />
              </mat-form-field>
              <button mat-stroked-button type="button" (click)="addAusencia()">Registrar</button>
            </form>

            <div class="table-container">
            <table mat-table [dataSource]="ausencias()" class="data-table responsive-table">
              <ng-container matColumnDef="tipo">
                <th mat-header-cell *matHeaderCellDef>Tipo</th>
                <td mat-cell *matCellDef="let a" data-label="Tipo">{{ tipoLabel(a.tipo) }}</td>
              </ng-container>
              <ng-container matColumnDef="periodo">
                <th mat-header-cell *matHeaderCellDef>Período</th>
                <td mat-cell *matCellDef="let a" data-label="Período">
                  {{ a.fecha_inicio | date: 'dd/MM/yyyy HH:mm' }} –
                  {{ a.fecha_fin | date: 'dd/MM/yyyy HH:mm' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="motivo">
                <th mat-header-cell *matHeaderCellDef>Motivo</th>
                <td mat-cell *matCellDef="let a" data-label="Motivo">{{ a.motivo || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="acciones">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let a" data-label="">
                  <div class="cell-actions">
                  <button mat-icon-button color="warn" (click)="deleteAusencia(a)">
                    <mat-icon>delete</mat-icon>
                  </button>
                  </div>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="ausenciaColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: ausenciaColumns"></tr>
            </table>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Google Calendar">
          <div class="tab-content">
            <p class="muted">ID del calendario donde se crean los turnos de este profesional. Usá <code>primary</code> o el email del calendario.</p>
            <form [formGroup]="calendarForm" class="inline-form-responsive">
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>Calendar ID</mat-label>
                <input matInput formControlName="google_calendar_id" placeholder="primary" />
              </mat-form-field>
              <button mat-stroked-button type="button" (click)="saveCalendarId()">Guardar</button>
            </form>
          </div>
        </mat-tab>

        <mat-tab label="Servicios">
          <div class="tab-content">
            <form [formGroup]="servicioForm" class="inline-form-responsive">
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>Servicio</mat-label>
                <mat-select formControlName="servicio_id">
                  @for (s of allServicios(); track s.id) {
                    <mat-option [value]="s.id">{{ s.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-stroked-button type="button" (click)="linkServicio()">Asignar</button>
            </form>

            <div class="chips">
              @for (s of serviciosAsignados(); track s.id) {
                <mat-chip-row (removed)="unlinkServicio(s.id)">
                  {{ s.nombre }}
                  <button matChipRemove><mat-icon>cancel</mat-icon></button>
                </mat-chip-row>
              } @empty {
                <p class="muted">Sin servicios asignados</p>
              }
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: `
    .header h1 { margin: 0.5rem 0 0; font-size: var(--text-h1); }
    .muted { color: var(--app-text-muted); word-break: break-word; }
    .tab-content { padding: 1rem 0; }
    .full-width-field { width: 100%; max-width: 100%; }
    @media (min-width: 768px) { .full-width-field { max-width: 20rem; } }
    .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    code { word-break: break-all; }
  `,
})
export class PersonalDetailComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);

  readonly dias = DIAS_SEMANA;
  readonly horarioColumns = ['dia', 'horario', 'acciones'];
  readonly ausenciaColumns = ['tipo', 'periodo', 'motivo', 'acciones'];

  readonly loading = signal(true);
  readonly profesional = signal<Profesional | null>(null);
  readonly horarios = signal<HorarioLaboral[]>([]);
  readonly ausencias = signal<Ausencia[]>([]);
  readonly allServicios = signal<Servicio[]>([]);
  readonly serviciosAsignados = signal<Servicio[]>([]);

  private profesionalId = '';

  readonly horarioForm = this.fb.nonNullable.group({
    dia_semana: [1, Validators.required],
    hora_inicio: ['09:00', Validators.required],
    hora_fin: ['18:00', Validators.required],
  });

  readonly ausenciaForm = this.fb.nonNullable.group({
    tipo: ['vacacion' as AusenciaTipo, Validators.required],
    fecha_inicio: ['', Validators.required],
    fecha_fin: ['', Validators.required],
    motivo: [''],
  });

  readonly servicioForm = this.fb.nonNullable.group({
    servicio_id: ['', Validators.required],
  });

  readonly calendarForm = this.fb.nonNullable.group({
    google_calendar_id: [''],
  });

  ngOnInit(): void {
    this.profesionalId = this.route.snapshot.paramMap.get('id')!;
    void this.load();
  }

  private async load(): Promise<void> {
    const [profRes, horRes, ausRes, servRes, spRes] = await Promise.all([
      this.supabase.client.from('profesionales').select('*').eq('id', this.profesionalId).single(),
      this.supabase.client.from('horarios_laborales').select('*').eq('profesional_id', this.profesionalId),
      this.supabase.client.from('ausencias').select('*').eq('profesional_id', this.profesionalId).order('fecha_inicio', { ascending: false }),
      this.supabase.client.from('servicios').select('*').is('deleted_at', null).eq('activo', true),
      this.supabase.client.from('servicio_profesional').select('servicio_id').eq('profesional_id', this.profesionalId),
    ]);

    this.profesional.set(profRes.data as Profesional);
    this.calendarForm.patchValue({
      google_calendar_id: (profRes.data as Profesional).google_calendar_id ?? 'primary',
    });
    this.horarios.set((horRes.data ?? []) as HorarioLaboral[]);
    this.ausencias.set((ausRes.data ?? []) as Ausencia[]);

    const servicios = (servRes.data ?? []) as Servicio[];
    this.allServicios.set(servicios);

    const linkedIds = new Set(
      (spRes.data ?? []).map((r: { servicio_id: string }) => r.servicio_id),
    );
    this.serviciosAsignados.set(servicios.filter((s) => linkedIds.has(s.id)));

    this.loading.set(false);
  }

  async addHorario(): Promise<void> {
    if (this.horarioForm.invalid) return;

    const { error } = await this.supabase.client.from('horarios_laborales').insert({
      ...this.horarioForm.getRawValue(),
      profesional_id: this.profesionalId,
    });

    if (error) {
      alert(error.message);
      return;
    }

    void this.load();
  }

  async deleteHorario(h: HorarioLaboral): Promise<void> {
    await this.supabase.client.from('horarios_laborales').delete().eq('id', h.id);
    void this.load();
  }

  async addAusencia(): Promise<void> {
    if (this.ausenciaForm.invalid) return;

    const raw = this.ausenciaForm.getRawValue();
    const { error } = await this.supabase.client.from('ausencias').insert({
      tipo: raw.tipo,
      fecha_inicio: new Date(raw.fecha_inicio).toISOString(),
      fecha_fin: new Date(raw.fecha_fin).toISOString(),
      motivo: raw.motivo || null,
      profesional_id: this.profesionalId,
    });

    if (error) {
      alert(error.message);
      return;
    }

    this.ausenciaForm.reset({ tipo: 'vacacion', motivo: '' });
    void this.load();
  }

  async deleteAusencia(a: Ausencia): Promise<void> {
    await this.supabase.client.from('ausencias').delete().eq('id', a.id);
    void this.load();
  }

  async linkServicio(): Promise<void> {
    const servicioId = this.servicioForm.value.servicio_id;
    if (!servicioId) return;

    const { error } = await this.supabase.client.from('servicio_profesional').insert({
      servicio_id: servicioId,
      profesional_id: this.profesionalId,
    });

    if (error) {
      alert(error.message);
      return;
    }

    void this.load();
  }

  async unlinkServicio(servicioId: string): Promise<void> {
    await this.supabase.client
      .from('servicio_profesional')
      .delete()
      .eq('servicio_id', servicioId)
      .eq('profesional_id', this.profesionalId);

    void this.load();
  }

  async saveCalendarId(): Promise<void> {
    const google_calendar_id = this.calendarForm.value.google_calendar_id?.trim() || null;
    const { error } = await this.supabase.client
      .from('profesionales')
      .update({ google_calendar_id })
      .eq('id', this.profesionalId);

    if (error) {
      alert(error.message);
      return;
    }

    void this.load();
  }

  tipoLabel(tipo: AusenciaTipo): string {
    const labels: Record<AusenciaTipo, string> = {
      vacacion: 'Vacaciones',
      licencia: 'Licencia',
      ausencia: 'Ausencia',
    };
    return labels[tipo];
  }
}
