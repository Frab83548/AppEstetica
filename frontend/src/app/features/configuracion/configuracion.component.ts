import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-configuracion',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Configuración</h1>
        <p class="subtitle">Políticas y datos del negocio</p>
      </div>
    </div>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <mat-card class="config-card">
        <h3>Política de cancelación</h3>
        <form [formGroup]="form" class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>Horas mínimas para cancelar</mat-label>
            <input matInput type="number" formControlName="horas_minimas" />
          </mat-form-field>
          <mat-slide-toggle formControlName="permitir_no_show">Permitir marcar no-show</mat-slide-toggle>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Mensaje al cliente</mat-label>
            <textarea matInput rows="3" formControlName="mensaje"></textarea>
          </mat-form-field>
          <button mat-flat-button color="primary" [disabled]="saving()" (click)="guardar()">Guardar</button>
        </form>
      </mat-card>
    }
  `,
  styles: `
    .page-header { margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; }
    .subtitle { margin: 0.25rem 0 0; color: var(--app-text-muted); }
    .config-card { padding: 1.25rem; max-width: 640px; }
    .config-card h3 { margin: 0 0 1rem; }
    .form-grid { display: flex; flex-direction: column; gap: 1rem; }
    .full { width: 100%; }
    .loading { display: flex; justify-content: center; padding: 3rem; }
  `,
})
export class ConfiguracionComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);

  readonly loading = signal(true);
  readonly saving = signal(false);

  form = this.fb.group({
    horas_minimas: [24, [Validators.required, Validators.min(0)]],
    permitir_no_show: [true],
    mensaje: ['', Validators.required],
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('configuracion')
      .select('valor')
      .eq('clave', 'politica_cancelacion')
      .maybeSingle();

    if (data?.valor) {
      const v = data.valor as { horas_minimas: number; permitir_no_show: boolean; mensaje: string };
      this.form.patchValue(v);
    }
    this.loading.set(false);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    await this.supabase.client.from('configuracion').upsert({
      clave: 'politica_cancelacion',
      valor: this.form.getRawValue(),
    });
    this.saving.set(false);
  }
}
