import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../core/services/supabase.service';

interface HistorialItem {
  id: string;
  accion: string;
  created_at: string;
  datos: unknown;
}

@Component({
  selector: 'app-cliente-historial-dialog',
  imports: [DatePipe, MatDialogModule, MatListModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Historial del cliente</h2>
    <mat-dialog-content>
      @if (loading()) {
        <div class="loading"><mat-spinner /></div>
      } @else if (items().length === 0) {
        <p>Sin historial registrado.</p>
      } @else {
        <mat-list>
          @for (h of items(); track h.id) {
            <mat-list-item>
              <span matListItemTitle>{{ h.accion }} — {{ h.created_at | date:'dd/MM/yyyy HH:mm' }}</span>
            </mat-list-item>
          }
        </mat-list>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-list-item span { word-break: break-word; }
  `,
})
export class ClienteHistorialDialogComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly data = inject<{ clienteId: string }>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ClienteHistorialDialogComponent>);

  readonly loading = signal(true);
  readonly items = signal<HistorialItem[]>([]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const { data } = await this.supabase.client
      .from('cliente_historial')
      .select('*')
      .eq('cliente_id', this.data.clienteId)
      .order('created_at', { ascending: false });
    this.items.set((data ?? []) as HistorialItem[]);
    this.loading.set(false);
  }
}
