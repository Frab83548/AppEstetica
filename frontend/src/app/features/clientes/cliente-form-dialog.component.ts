import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Cliente } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-cliente-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar cliente' : 'Nuevo cliente' }}</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="nombre" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Apellido</mat-label>
          <input matInput formControlName="apellido" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>DNI</mat-label>
          <input matInput formControlName="dni" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Fecha de nacimiento</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="fecha_nacimiento" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Teléfono</mat-label>
          <input matInput formControlName="telefono" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Observaciones</mat-label>
          <textarea matInput rows="3" formControlName="observaciones"></textarea>
        </mat-form-field>
      </form>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        @if (saving()) { <mat-spinner diameter="20" /> } @else { Guardar }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 1rem;
    }

    .full-width { grid-column: 1 / -1; }

    .error { color: var(--app-error); font-size: 0.875rem; }

    @media (max-width: 500px) {
      .form-grid { grid-template-columns: 1fr; }
    }
  `,
})
export class ClienteFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly dialogRef = inject(MatDialogRef<ClienteFormDialogComponent>);
  readonly data = inject<Cliente | null>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre: [this.data?.nombre ?? '', Validators.required],
    apellido: [this.data?.apellido ?? '', Validators.required],
    dni: [this.data?.dni ?? ''],
    fecha_nacimiento: [this.data?.fecha_nacimiento ? new Date(this.data.fecha_nacimiento) : null as Date | null],
    email: [this.data?.email ?? '', Validators.email],
    telefono: [this.data?.telefono ?? ''],
    observaciones: [this.data?.observaciones ?? ''],
  });

  async save(): Promise<void> {
    if (this.form.invalid) return;

    this.saving.set(true);
    this.error.set(null);

    const raw = this.form.getRawValue();
    const payload = {
      nombre: raw.nombre,
      apellido: raw.apellido,
      dni: raw.dni || null,
      fecha_nacimiento: raw.fecha_nacimiento
        ? raw.fecha_nacimiento.toISOString().slice(0, 10)
        : null,
      email: raw.email || null,
      telefono: raw.telefono || null,
      observaciones: raw.observaciones || null,
    };

    const result = this.isEdit
      ? await this.supabase.client.from('clientes').update(payload).eq('id', this.data!.id)
      : await this.supabase.client.from('clientes').insert(payload);

    this.saving.set(false);

    if (result.error) {
      this.error.set(result.error.message);
      return;
    }

    this.dialogRef.close(true);
  }
}
