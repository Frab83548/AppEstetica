import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { SupabaseService } from '../../core/services/supabase.service';

type CampanaSegmento = 'todos' | 'frecuentes' | 'inactivos' | 'por_servicio';

interface Campana {
  id: string;
  titulo: string;
  mensaje: string;
  segmento: CampanaSegmento;
  estado: string;
  enviados: number;
  fallidos: number;
  created_at: string;
}

@Component({
  selector: 'app-marketing',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Marketing</h1>
        <p class="subtitle">Campañas por Telegram (solo suscriptores con opt-in)</p>
      </div>
    </div>

    <mat-card class="form-card">
      <h3>Nueva campaña</h3>
      <form [formGroup]="form" class="form-grid-responsive">
        <mat-form-field appearance="outline">
          <mat-label>Título interno</mat-label>
          <input matInput formControlName="titulo" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Segmento</mat-label>
          <mat-select formControlName="segmento">
            <mat-option value="todos">Todos (opt-in)</mat-option>
            <mat-option value="frecuentes">Clientes frecuentes</mat-option>
            <mat-option value="inactivos">Clientes inactivos (+90 días)</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Mensaje</mat-label>
          <textarea matInput rows="4" formControlName="mensaje"></textarea>
        </mat-form-field>
        <div class="actions form-actions">
          <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="crear()">
            Guardar borrador
          </button>
        </div>
      </form>
      <p class="hint">
        Solo se envía a usuarios que iniciaron el bot y no ejecutaron /stop. Respeta las políticas de Telegram.
      </p>
    </mat-card>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <div class="table-container">
      <table mat-table [dataSource]="campanas()" class="data-table responsive-table">
        <ng-container matColumnDef="titulo">
          <th mat-header-cell *matHeaderCellDef>Título</th>
          <td mat-cell *matCellDef="let c" data-label="Título">{{ c.titulo }}</td>
        </ng-container>
        <ng-container matColumnDef="segmento">
          <th mat-header-cell *matHeaderCellDef>Segmento</th>
          <td mat-cell *matCellDef="let c" data-label="Segmento">{{ c.segmento }}</td>
        </ng-container>
        <ng-container matColumnDef="estado">
          <th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let c" data-label="Estado">{{ c.estado }}</td>
        </ng-container>
        <ng-container matColumnDef="stats">
          <th mat-header-cell *matHeaderCellDef>Enviados / Fallidos</th>
          <td mat-cell *matCellDef="let c" data-label="Enviados / Fallidos">{{ c.enviados }} / {{ c.fallidos }}</td>
        </ng-container>
        <ng-container matColumnDef="acciones">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let c" data-label="">
            <button mat-stroked-button (click)="enviar(c)" [disabled]="c.estado === 'completada'">
              <mat-icon>send</mat-icon>
              Enviar
            </button>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let row; columns: cols"></tr>
      </table>
      </div>
    }
  `,
  styles: `
    .form-card { padding: clamp(1rem, 3vw, 1.25rem); margin-bottom: 1.5rem; max-width: 100%; }
    .form-card h3 { margin: 0 0 1rem; font-size: var(--text-h3); }
    .hint { margin: 1rem 0 0; font-size: 0.875rem; color: var(--app-text-muted); }
  `,
})
export class MarketingComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly campanas = signal<Campana[]>([]);
  cols = ['titulo', 'segmento', 'estado', 'stats', 'acciones'];

  form = this.fb.group({
    titulo: ['', Validators.required],
    mensaje: ['', Validators.required],
    segmento: ['todos' as CampanaSegmento, Validators.required],
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client.from('campanas').select('*').order('created_at', { ascending: false });
    this.campanas.set((data ?? []) as Campana[]);
    this.loading.set(false);
  }

  async crear(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    await this.supabase.client.from('campanas').insert({
      titulo: v.titulo,
      mensaje: v.mensaje,
      segmento: v.segmento,
      estado: 'borrador',
    });
    this.form.reset({ segmento: 'todos' });
    this.saving.set(false);
    void this.load();
  }

  async enviar(campana: Campana): Promise<void> {
    if (!confirm(`¿Enviar campaña "${campana.titulo}" por Telegram?`)) return;
    await this.supabase.client.functions.invoke('campanas-dispatch', {
      body: { campana_id: campana.id },
    });
    await this.supabase.client.from('campanas').update({ estado: 'completada' }).eq('id', campana.id);
    void this.load();
  }
}
