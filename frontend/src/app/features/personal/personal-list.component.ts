import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { Profesional } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-personal-list',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Personal</h1>
        <p class="subtitle">Profesionales, horarios y ausencias</p>
      </div>
    </div>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <div class="table-container">
        <table mat-table [dataSource]="profesionales()" class="data-table">
          <ng-container matColumnDef="nombre">
            <th mat-header-cell *matHeaderCellDef>Profesional</th>
            <td mat-cell *matCellDef="let p">{{ p.nombre }} {{ p.apellido }}</td>
          </ng-container>

          <ng-container matColumnDef="contacto">
            <th mat-header-cell *matHeaderCellDef>Contacto</th>
            <td mat-cell *matCellDef="let p">
              {{ p.email || '—' }}<br />
              <small class="muted">{{ p.telefono || '' }}</small>
            </td>
          </ng-container>

          <ng-container matColumnDef="especialidades">
            <th mat-header-cell *matHeaderCellDef>Especialidades</th>
            <td mat-cell *matCellDef="let p">
              @for (e of p.especialidades; track e) {
                <mat-chip>{{ e }}</mat-chip>
              } @empty {
                <span class="muted">—</span>
              }
            </td>
          </ng-container>

          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let p">
              <a mat-stroked-button [routerLink]="['/personal', p.id]">Ver detalle</a>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    .page-header h1 { margin: 0; font-size: 1.75rem; font-weight: 600; }
    .subtitle { margin: 0.25rem 0 0; color: var(--app-text-muted); }
    .loading { display: flex; justify-content: center; padding: 2rem; }
    .table-container { overflow-x: auto; background: var(--app-surface); border-radius: 12px; border: 1px solid var(--app-border); }
    .data-table { width: 100%; }
    .muted { color: var(--app-text-muted); }
    mat-chip { margin: 2px; font-size: 0.75rem; }
  `,
})
export class PersonalListComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  readonly columns = ['nombre', 'contacto', 'especialidades', 'acciones'];
  readonly loading = signal(true);
  readonly profesionales = signal<Profesional[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('profesionales')
      .select('*')
      .is('deleted_at', null)
      .eq('activo', true)
      .order('apellido');

    if (error) console.error(error);
    this.profesionales.set((data ?? []) as Profesional[]);
    this.loading.set(false);
  }
}
