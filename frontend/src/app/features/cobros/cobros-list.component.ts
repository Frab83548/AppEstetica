import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Cliente, Cobro } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-cobro-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Registrar cobro</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Cliente</mat-label>
          <mat-select formControlName="cliente_id">
            @for (c of clientes(); track c.id) {
              <mat-option [value]="c.id">{{ c.nombre }} {{ c.apellido }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Monto (ARS)</mat-label>
          <input matInput type="number" formControlName="monto" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Medio de pago</mat-label>
          <mat-select formControlName="medio">
            <mat-option value="efectivo">Efectivo</mat-option>
            <mat-option value="transferencia">Transferencia</mat-option>
            <mat-option value="tarjeta">Tarjeta</mat-option>
            <mat-option value="otro">Otro</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notas"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="guardar()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: `.form-grid { display: grid; gap: 0.5rem; min-width: 320px; } .full { grid-column: 1 / -1; }`,
})
export class CobroFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly dialogRef = inject(MatDialogRef<CobroFormDialogComponent>);
  readonly clientes = signal<Cliente[]>([]);
  readonly saving = signal(false);

  form = this.fb.group({
    cliente_id: ['', Validators.required],
    monto: [0, [Validators.required, Validators.min(0)]],
    medio: ['efectivo', Validators.required],
    notas: [''],
  });

  constructor() {
    void this.loadClientes();
  }

  private async loadClientes(): Promise<void> {
    const { data } = await this.supabase.client.from('clientes').select('*').eq('activo', true).is('deleted_at', null).order('apellido');
    this.clientes.set((data ?? []) as Cliente[]);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    await this.supabase.client.from('cobros').insert({
      cliente_id: v.cliente_id,
      monto: v.monto,
      medio: v.medio,
      notas: v.notas || null,
    });
    this.saving.set(false);
    this.dialogRef.close(true);
  }
}

@Component({
  selector: 'app-cobros-list',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Cobros</h1>
        <p class="subtitle">Registro interno de ingresos</p>
      </div>
      <button mat-flat-button color="primary" (click)="openForm()">
        <mat-icon>add</mat-icon>
        Nuevo cobro
      </button>
    </div>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <table mat-table [dataSource]="cobros()" class="data-table">
        <ng-container matColumnDef="fecha">
          <th mat-header-cell *matHeaderCellDef>Fecha</th>
          <td mat-cell *matCellDef="let c">{{ c.fecha | date:'dd/MM/yyyy HH:mm' }}</td>
        </ng-container>
        <ng-container matColumnDef="cliente">
          <th mat-header-cell *matHeaderCellDef>Cliente</th>
          <td mat-cell *matCellDef="let c">{{ c.cliente?.nombre }} {{ c.cliente?.apellido }}</td>
        </ng-container>
        <ng-container matColumnDef="monto">
          <th mat-header-cell *matHeaderCellDef>Monto</th>
          <td mat-cell *matCellDef="let c">{{ c.monto | currency:'ARS':'symbol-narrow':'1.0-0' }}</td>
        </ng-container>
        <ng-container matColumnDef="medio">
          <th mat-header-cell *matHeaderCellDef>Medio</th>
          <td mat-cell *matCellDef="let c">{{ c.medio || '—' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let row; columns: cols"></tr>
      </table>
    }
  `,
  styles: `
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .page-header h1 { margin: 0; }
    .subtitle { margin: 0.25rem 0 0; color: var(--app-text-muted); }
    .loading { display: flex; justify-content: center; padding: 3rem; }
    .data-table { width: 100%; }
  `,
})
export class CobrosListComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly cobros = signal<(Cobro & { cliente?: { nombre: string; apellido: string } })[]>([]);
  cols = ['fecha', 'cliente', 'monto', 'medio'];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('cobros')
      .select('*, cliente:clientes(nombre, apellido)')
      .order('fecha', { ascending: false });
    this.cobros.set((data ?? []) as (Cobro & { cliente?: { nombre: string; apellido: string } })[]);
    this.loading.set(false);
  }

  openForm(): void {
    const ref = this.dialog.open(CobroFormDialogComponent, { width: '480px' });
    ref.afterClosed().subscribe(() => void this.load());
  }
}
