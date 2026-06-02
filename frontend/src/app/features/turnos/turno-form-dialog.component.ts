import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { format } from 'date-fns';
import {
  Cliente,
  parseRango,
  Profesional,
  Servicio,
  SlotDisponible,
  Turno,
} from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';
import { GcalService } from '../../core/services/gcal.service';

@Component({
  selector: 'app-turno-form-dialog',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Gestionar turno' : 'Reservar turno' }}</h2>

    <mat-dialog-content>
      @if (loading()) {
        <div class="loading"><mat-spinner /></div>
      } @else {
        <form [formGroup]="form" class="form-stack">
          @if (!isEdit) {
            <mat-form-field appearance="outline">
              <mat-label>Cliente</mat-label>
              <mat-select formControlName="cliente_id">
                @for (c of clientes(); track c.id) {
                  <mat-option [value]="c.id">{{ c.nombre }} {{ c.apellido }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Servicio</mat-label>
              <mat-select formControlName="servicio_id" (selectionChange)="loadSlots()">
                @for (s of servicios(); track s.id) {
                  <mat-option [value]="s.id">{{ s.nombre }} ({{ s.duracion_min }} min)</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Profesional</mat-label>
              <mat-select formControlName="profesional_id" (selectionChange)="loadSlots()">
                @for (p of profesionales(); track p.id) {
                  <mat-option [value]="p.id">{{ p.nombre }} {{ p.apellido }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="picker" formControlName="fecha" (dateChange)="loadSlots()" />
              <mat-datepicker-toggle matIconSuffix [for]="picker" />
              <mat-datepicker #picker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Horario disponible</mat-label>
              <mat-select formControlName="slot_inicio">
                @for (slot of slots(); track slot.slot_inicio) {
                  <mat-option [value]="slot.slot_inicio">
                    {{ slot.slot_inicio | date: 'HH:mm' }} – {{ slot.slot_fin | date: 'HH:mm' }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
          } @else {
            <p class="turno-info">
              <strong>{{ turnoData?.cliente?.nombre }} {{ turnoData?.cliente?.apellido }}</strong><br />
              {{ turnoData?.servicio?.nombre }} ·
              {{ turnoInicio() | date: 'dd/MM/yyyy HH:mm' }}
            </p>

            <mat-form-field appearance="outline">
              <mat-label>Nueva fecha y hora</mat-label>
              <input matInput type="datetime-local" formControlName="nuevo_inicio" />
            </mat-form-field>
          }

          <mat-form-field appearance="outline">
            <mat-label>Notas</mat-label>
            <textarea matInput rows="2" formControlName="notas"></textarea>
          </mat-form-field>
        </form>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="dialog-actions-stack">
      @if (isEdit && turnoData?.estado !== 'cancelado') {
        <button mat-button color="warn" (click)="cancelar()" [disabled]="saving()">Cancelar turno</button>
      }
      <button mat-button mat-dialog-close>Cerrar</button>
      @if (!isEdit || turnoData?.estado !== 'cancelado') {
        <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
          @if (saving()) { <mat-spinner diameter="20" /> }
          @else { {{ isEdit ? 'Reprogramar' : 'Reservar' }} }
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .form-stack { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
    .loading { display: flex; justify-content: center; padding: 2rem; }
    .turno-info { margin: 0 0 1rem; line-height: 1.5; word-break: break-word; }
    .error { color: var(--app-error); font-size: 0.875rem; }
    .dialog-actions-stack {
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
    }
    @media (max-width: 767px) {
      .dialog-actions-stack button { flex: 1 1 auto; min-width: calc(50% - 0.5rem); }
    }
  `,
})
export class TurnoFormDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly gcal = inject(GcalService);
  private readonly dialogRef = inject(MatDialogRef<TurnoFormDialogComponent>);
  readonly turnoData = inject<Turno | null>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.turnoData;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly clientes = signal<Cliente[]>([]);
  readonly servicios = signal<Servicio[]>([]);
  readonly profesionales = signal<Profesional[]>([]);
  readonly slots = signal<SlotDisponible[]>([]);

  readonly form = this.fb.nonNullable.group({
    cliente_id: [this.turnoData?.cliente_id ?? '', Validators.required],
    servicio_id: [this.turnoData?.servicio_id ?? '', Validators.required],
    profesional_id: [this.turnoData?.profesional_id ?? '', Validators.required],
    fecha: [new Date(), Validators.required],
    slot_inicio: ['', Validators.required],
    nuevo_inicio: [''],
    notas: [this.turnoData?.notas ?? ''],
  });

  ngOnInit(): void {
    void this.loadCatalogs();
  }

  turnoInicio(): Date | null {
    if (!this.turnoData) return null;
    return parseRango(this.turnoData.rango).inicio;
  }

  private async loadCatalogs(): Promise<void> {
    const [clientesRes, serviciosRes, profesionalesRes] = await Promise.all([
      this.supabase.client.from('clientes').select('*').is('deleted_at', null).eq('activo', true).order('apellido'),
      this.supabase.client.from('servicios').select('*').is('deleted_at', null).eq('activo', true).order('nombre'),
      this.supabase.client.from('profesionales').select('*').is('deleted_at', null).eq('activo', true).order('apellido'),
    ]);

    this.clientes.set((clientesRes.data ?? []) as Cliente[]);
    this.servicios.set((serviciosRes.data ?? []) as Servicio[]);
    this.profesionales.set((profesionalesRes.data ?? []) as Profesional[]);

    if (this.isEdit && this.turnoData) {
      const inicio = parseRango(this.turnoData.rango).inicio;
      this.form.patchValue({
        nuevo_inicio: format(inicio, "yyyy-MM-dd'T'HH:mm"),
      });
    }

    this.loading.set(false);
  }

  async loadSlots(): Promise<void> {
    const { profesional_id, servicio_id, fecha } = this.form.getRawValue();
    if (!profesional_id || !servicio_id || !fecha) return;

    const fechaStr = format(fecha, 'yyyy-MM-dd');

    const { data, error } = await this.supabase.client.rpc('obtener_slots_disponibles', {
      p_profesional_id: profesional_id,
      p_servicio_id: servicio_id,
      p_fecha: fechaStr,
    });

    if (error) {
      console.error(error);
      this.slots.set([]);
      return;
    }

    this.slots.set((data ?? []) as SlotDisponible[]);
    if (this.slots().length > 0) {
      this.form.patchValue({ slot_inicio: this.slots()[0].slot_inicio });
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.turnoData) {
      const nuevoInicio = this.form.value.nuevo_inicio;
      if (!nuevoInicio) {
        this.error.set('Seleccioná una nueva fecha y hora');
        this.saving.set(false);
        return;
      }

      const { error } = await this.supabase.client.rpc('reprogramar_turno', {
        p_turno_id: this.turnoData.id,
        p_nuevo_inicio: new Date(nuevoInicio).toISOString(),
      });

      this.saving.set(false);
      if (error) {
        this.error.set(error.message);
        return;
      }
      await this.gcal.syncTurno(this.turnoData.id);
    } else {
      const raw = this.form.getRawValue();
      const { data: turnoId, error } = await this.supabase.client.rpc('reservar_turno', {
        p_cliente_id: raw.cliente_id,
        p_profesional_id: raw.profesional_id,
        p_servicio_id: raw.servicio_id,
        p_inicio: raw.slot_inicio,
        p_origen: 'panel',
        p_notas: raw.notas || null,
      });

      this.saving.set(false);
      if (error) {
        this.error.set(error.message);
        return;
      }
      if (turnoId) await this.gcal.syncTurno(turnoId as string);
    }

    this.dialogRef.close(true);
  }

  async cancelar(): Promise<void> {
    if (!this.turnoData || !confirm('¿Cancelar este turno?')) return;

    this.saving.set(true);
    const motivo = this.form.value.notas || null;

    const { error } = await this.supabase.client.rpc('cancelar_turno', {
      p_turno_id: this.turnoData.id,
      p_motivo: motivo,
    });

    this.saving.set(false);

    if (error) {
      this.error.set(error.message);
      return;
    }

    await this.gcal.syncTurno(this.turnoData.id, 'delete');
    this.dialogRef.close(true);
  }
}
