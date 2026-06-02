import { CurrencyPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { Promocion, Servicio } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-servicios-list',
  imports: [
    CurrencyPipe,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Servicios</h1>
        <p class="subtitle">Tratamientos y promociones vigentes</p>
      </div>
      <a mat-flat-button color="primary" routerLink="/servicios/nuevo">
        <mat-icon>add</mat-icon>
        Nuevo servicio
      </a>
    </div>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <div class="table-container">
        <table mat-table [dataSource]="servicios()" class="data-table responsive-table">
          <ng-container matColumnDef="nombre">
            <th mat-header-cell *matHeaderCellDef>Servicio</th>
            <td mat-cell *matCellDef="let s" data-label="Servicio">
              <strong>{{ s.nombre }}</strong>
              @if (s.descripcion) {
                <br /><small class="muted">{{ s.descripcion }}</small>
              }
            </td>
          </ng-container>

          <ng-container matColumnDef="duracion">
            <th mat-header-cell *matHeaderCellDef>Duración</th>
            <td mat-cell *matCellDef="let s" data-label="Duración">{{ s.duracion_min }} min</td>
          </ng-container>

          <ng-container matColumnDef="precio">
            <th mat-header-cell *matHeaderCellDef>Precio</th>
            <td mat-cell *matCellDef="let s" data-label="Precio">{{ s.precio | currency: 'ARS' : 'symbol' : '1.0-0' }}</td>
          </ng-container>

          <ng-container matColumnDef="promociones">
            <th mat-header-cell *matHeaderCellDef>Promociones</th>
            <td mat-cell *matCellDef="let s" data-label="Promociones">
              <div class="chips-wrap">
              @for (p of promosFor(s.id); track p.id) {
                <mat-chip>{{ p.nombre }}</mat-chip>
              } @empty {
                <span class="muted">—</span>
              }
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let s" data-label="">
              <div class="cell-actions">
              <button mat-icon-button matTooltip="Editar" [routerLink]="['/servicios', s.id]">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button matTooltip="Eliminar" color="warn" (click)="softDelete(s)">
                <mat-icon>delete</mat-icon>
              </button>
              </div>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    .muted { color: var(--app-text-muted); font-size: 0.8125rem; word-break: break-word; }
    mat-chip { font-size: 0.75rem; }
  `,
})
export class ServiciosListComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  readonly columns = ['nombre', 'duracion', 'precio', 'promociones', 'acciones'];
  readonly loading = signal(true);
  readonly servicios = signal<Servicio[]>([]);
  readonly promociones = signal<Promocion[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);

    const [servRes, promoRes] = await Promise.all([
      this.supabase.client
        .from('servicios')
        .select('*')
        .is('deleted_at', null)
        .eq('activo', true)
        .order('nombre'),
      this.supabase.client.from('promociones').select('*').eq('activo', true),
    ]);

    this.servicios.set((servRes.data ?? []) as Servicio[]);
    this.promociones.set((promoRes.data ?? []) as Promocion[]);
    this.loading.set(false);
  }

  promosFor(servicioId: string): Promocion[] {
    return this.promociones().filter((p) => p.servicio_id === servicioId);
  }

  async softDelete(servicio: Servicio): Promise<void> {
    if (!confirm(`¿Eliminar el servicio "${servicio.nombre}"?`)) return;

    const { error } = await this.supabase.client
      .from('servicios')
      .update({ deleted_at: new Date().toISOString(), activo: false })
      .eq('id', servicio.id);

    if (error) {
      alert(error.message);
      return;
    }

    void this.load();
  }
}
