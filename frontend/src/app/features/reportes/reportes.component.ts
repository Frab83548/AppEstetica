import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { endOfDay, startOfDay } from 'date-fns';
import { Profesional, Servicio, TURNO_ESTADO_LABELS } from '../../core/models';
import { ExportService, ReporteTurnoRow } from '../../core/services/export.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-reportes',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Reportes</h1>
        <p class="subtitle">Exportá turnos en PDF o Excel</p>
      </div>
    </div>

    <form [formGroup]="form" class="filters-row">
      <mat-form-field appearance="outline">
        <mat-label>Desde</mat-label>
        <input matInput [matDatepicker]="dp1" formControlName="desde" />
        <mat-datepicker-toggle matIconSuffix [for]="dp1" />
        <mat-datepicker #dp1 />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Hasta</mat-label>
        <input matInput [matDatepicker]="dp2" formControlName="hasta" />
        <mat-datepicker-toggle matIconSuffix [for]="dp2" />
        <mat-datepicker #dp2 />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Profesional</mat-label>
        <mat-select formControlName="profesional_id">
          <mat-option value="">Todos</mat-option>
          @for (p of profesionales(); track p.id) {
            <mat-option [value]="p.id">{{ p.nombre }} {{ p.apellido }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Servicio</mat-label>
        <mat-select formControlName="servicio_id">
          <mat-option value="">Todos</mat-option>
          @for (s of servicios(); track s.id) {
            <mat-option [value]="s.id">{{ s.nombre }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button mat-flat-button color="primary" type="button" (click)="buscar()">
        <mat-icon>search</mat-icon>
        Buscar
      </button>
      <div class="filters-actions">
        <button mat-stroked-button type="button" [disabled]="rows().length === 0" (click)="exportPdf()">
          <mat-icon>picture_as_pdf</mat-icon>
          PDF
        </button>
        <button mat-stroked-button type="button" [disabled]="rows().length === 0" (click)="exportExcel()">
          <mat-icon>table_chart</mat-icon>
          Excel
        </button>
      </div>
    </form>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <div class="table-container">
      <table mat-table [dataSource]="rows()" class="data-table responsive-table">
        <ng-container matColumnDef="fecha">
          <th mat-header-cell *matHeaderCellDef>Fecha</th>
          <td mat-cell *matCellDef="let r" data-label="Fecha">{{ r.fecha | date:'dd/MM/yyyy HH:mm' }}</td>
        </ng-container>
        <ng-container matColumnDef="cliente">
          <th mat-header-cell *matHeaderCellDef>Cliente</th>
          <td mat-cell *matCellDef="let r" data-label="Cliente">{{ r.cliente }}</td>
        </ng-container>
        <ng-container matColumnDef="profesional">
          <th mat-header-cell *matHeaderCellDef>Profesional</th>
          <td mat-cell *matCellDef="let r" data-label="Profesional">{{ r.profesional }}</td>
        </ng-container>
        <ng-container matColumnDef="servicio">
          <th mat-header-cell *matHeaderCellDef>Servicio</th>
          <td mat-cell *matCellDef="let r" data-label="Servicio">{{ r.servicio }}</td>
        </ng-container>
        <ng-container matColumnDef="estado">
          <th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let r" data-label="Estado">{{ estadoLabel(r.estado) }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let row; columns: cols"></tr>
      </table>
      </div>
    }
  `,
  styles: ``,
})
export class ReportesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly exportSvc = inject(ExportService);

  readonly loading = signal(false);
  readonly rows = signal<ReporteTurnoRow[]>([]);
  readonly profesionales = signal<Profesional[]>([]);
  readonly servicios = signal<Servicio[]>([]);
  cols = ['fecha', 'cliente', 'profesional', 'servicio', 'estado'];

  form = this.fb.group({
    desde: [new Date(new Date().getFullYear(), new Date().getMonth(), 1)],
    hasta: [new Date()],
    profesional_id: [''],
    servicio_id: [''],
  });

  ngOnInit(): void {
    void this.loadFilters();
    void this.buscar();
  }

  private async loadFilters(): Promise<void> {
    const [p, s] = await Promise.all([
      this.supabase.client.from('profesionales').select('*').eq('activo', true).is('deleted_at', null),
      this.supabase.client.from('servicios').select('*').eq('activo', true).is('deleted_at', null),
    ]);
    this.profesionales.set((p.data ?? []) as Profesional[]);
    this.servicios.set((s.data ?? []) as Servicio[]);
  }

  async buscar(): Promise<void> {
    this.loading.set(true);
    const v = this.form.getRawValue();
    const desde = startOfDay(v.desde ?? new Date()).toISOString();
    const hasta = endOfDay(v.hasta ?? new Date()).toISOString();

    const { data } = await this.supabase.client.rpc('reporte_turnos', {
      p_desde: desde,
      p_hasta: hasta,
      p_profesional_id: v.profesional_id || null,
      p_servicio_id: v.servicio_id || null,
    });

    this.rows.set((data ?? []) as ReporteTurnoRow[]);
    this.loading.set(false);
  }

  exportPdf(): void {
    this.exportSvc.exportPdf(this.rows(), 'Reporte_Turnos');
  }

  exportExcel(): void {
    this.exportSvc.exportExcel(this.rows(), 'Reporte_Turnos');
  }

  estadoLabel(estado: string): string {
    return TURNO_ESTADO_LABELS[estado as keyof typeof TURNO_ESTADO_LABELS] ?? estado;
  }
}
