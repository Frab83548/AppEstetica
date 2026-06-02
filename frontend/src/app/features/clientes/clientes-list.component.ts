import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Cliente } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';
import { ClienteFormDialogComponent } from './cliente-form-dialog.component';
import { ClienteHistorialDialogComponent } from './cliente-historial-dialog.component';
import { appDialogConfig } from '../../core/constants/dialog.config';

@Component({
  selector: 'app-clientes-list',
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Clientes</h1>
        <p class="subtitle">Gestión de clientes del centro</p>
      </div>
      <button mat-flat-button color="primary" (click)="openForm()">
        <mat-icon>person_add</mat-icon>
        Nuevo cliente
      </button>
    </div>

    <mat-form-field appearance="outline" class="search-field">
      <mat-label>Buscar</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input matInput [formControl]="searchCtrl" placeholder="Nombre, DNI, email..." />
    </mat-form-field>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <div class="table-container">
        <table mat-table [dataSource]="clientes()" class="data-table responsive-table">
          <ng-container matColumnDef="nombre">
            <th mat-header-cell *matHeaderCellDef>Nombre</th>
            <td mat-cell *matCellDef="let c" data-label="Nombre">{{ c.nombre }} {{ c.apellido }}</td>
          </ng-container>

          <ng-container matColumnDef="dni">
            <th mat-header-cell *matHeaderCellDef>DNI</th>
            <td mat-cell *matCellDef="let c" data-label="DNI">{{ c.dni || '—' }}</td>
          </ng-container>

          <ng-container matColumnDef="telefono">
            <th mat-header-cell *matHeaderCellDef>Teléfono</th>
            <td mat-cell *matCellDef="let c" data-label="Teléfono">{{ c.telefono || '—' }}</td>
          </ng-container>

          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let c" data-label="Email">{{ c.email || '—' }}</td>
          </ng-container>

          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let c" data-label="">
              <button mat-icon-button matTooltip="Historial" (click)="openHistorial(c)">
                <mat-icon>history</mat-icon>
              </button>
              <button mat-icon-button matTooltip="Editar" (click)="openForm(c)">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button matTooltip="Eliminar" color="warn" (click)="softDelete(c)">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>

        @if (clientes().length === 0) {
          <p class="empty-state">No se encontraron clientes</p>
        }
      </div>
    }
  `,
  styles: `
    .search-field { width: 100%; max-width: 100%; margin-bottom: 1rem; }
    @media (min-width: 768px) { .search-field { max-width: 400px; } }
  `,
})
export class ClientesListComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly dialog = inject(MatDialog);

  readonly columns = ['nombre', 'dni', 'telefono', 'email', 'acciones'];
  readonly loading = signal(true);
  readonly clientes = signal<Cliente[]>([]);
  readonly searchCtrl = new FormControl('', { nonNullable: true });

  ngOnInit(): void {
    void this.load();

    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => void this.load());
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const term = this.searchCtrl.value.trim().toLowerCase();

    let query = this.supabase.client
      .from('clientes')
      .select('*')
      .is('deleted_at', null)
      .eq('activo', true)
      .order('apellido');

    const { data, error } = await query;

    if (error) {
      console.error(error);
      this.clientes.set([]);
    } else {
      let items = (data ?? []) as Cliente[];
      if (term) {
        items = items.filter(
          (c) =>
            `${c.nombre} ${c.apellido}`.toLowerCase().includes(term) ||
            c.dni?.toLowerCase().includes(term) ||
            c.email?.toLowerCase().includes(term) ||
            c.telefono?.includes(term),
        );
      }
      this.clientes.set(items);
    }

    this.loading.set(false);
  }

  openForm(cliente?: Cliente): void {
    const ref = this.dialog.open(ClienteFormDialogComponent, appDialogConfig({
      width: '520px',
      data: cliente ?? null,
    }));

    ref.afterClosed().subscribe((saved) => {
      if (saved) void this.load();
    });
  }

  openHistorial(cliente: Cliente): void {
    this.dialog.open(ClienteHistorialDialogComponent, appDialogConfig({
      width: '480px',
      data: { clienteId: cliente.id },
    }));
  }

  async softDelete(cliente: Cliente): Promise<void> {
    if (!confirm(`¿Eliminar a ${cliente.nombre} ${cliente.apellido}?`)) return;

    const { error } = await this.supabase.client
      .from('clientes')
      .update({ deleted_at: new Date().toISOString(), activo: false })
      .eq('id', cliente.id);

    if (error) {
      alert(error.message);
      return;
    }

    void this.load();
  }
}
