import { CurrencyPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Promocion, PromocionTipo, Servicio } from '../../core/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-servicio-form',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    RouterLink,
  ],
  template: `
    <div class="page-header">
      <div>
        <a mat-button routerLink="/servicios"><mat-icon>arrow_back</mat-icon> Volver</a>
        <h1>{{ isEdit ? 'Editar servicio' : 'Nuevo servicio' }}</h1>
      </div>
    </div>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <div class="form-layout">
        <mat-card class="form-card">
          <mat-card-header><mat-card-title>Datos del servicio</mat-card-title></mat-card-header>
          <mat-card-content>
            <form [formGroup]="form" class="form-grid-responsive">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Nombre</mat-label>
                <input matInput formControlName="nombre" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Descripción</mat-label>
                <textarea matInput rows="3" formControlName="descripcion"></textarea>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Duración (minutos)</mat-label>
                <input matInput type="number" formControlName="duracion_min" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Precio</mat-label>
                <input matInput type="number" formControlName="precio" />
                <span matTextPrefix>$&nbsp;</span>
              </mat-form-field>
            </form>

            @if (error()) {
              <p class="error">{{ error() }}</p>
            }

            <div class="actions">
              <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="saveServicio()">
                @if (saving()) { <mat-spinner diameter="20" /> } @else { Guardar servicio }
              </button>
            </div>
          </mat-card-content>
        </mat-card>

        @if (isEdit) {
          <mat-card class="form-card">
            <mat-card-header>
              <mat-card-title>Promociones</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="promoForm" class="inline-form-responsive">
                <mat-form-field appearance="outline">
                  <mat-label>Nombre</mat-label>
                  <input matInput formControlName="nombre" />
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Tipo</mat-label>
                  <mat-select formControlName="tipo">
                    <mat-option value="porcentaje">Porcentaje</mat-option>
                    <mat-option value="monto_fijo">Monto fijo</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Valor</mat-label>
                  <input matInput type="number" formControlName="valor" />
                </mat-form-field>

                <button mat-stroked-button type="button" [disabled]="promoForm.invalid" (click)="addPromocion()">
                  Agregar
                </button>
              </form>

              <div class="table-container">
              <table mat-table [dataSource]="promociones()" class="data-table responsive-table">
                <ng-container matColumnDef="nombre">
                  <th mat-header-cell *matHeaderCellDef>Nombre</th>
                  <td mat-cell *matCellDef="let p" data-label="Nombre">{{ p.nombre }}</td>
                </ng-container>
                <ng-container matColumnDef="tipo">
                  <th mat-header-cell *matHeaderCellDef>Tipo</th>
                  <td mat-cell *matCellDef="let p" data-label="Tipo">{{ p.tipo === 'porcentaje' ? '%' : '$' }}</td>
                </ng-container>
                <ng-container matColumnDef="valor">
                  <th mat-header-cell *matHeaderCellDef>Valor</th>
                  <td mat-cell *matCellDef="let p" data-label="Valor">
                    @if (p.tipo === 'porcentaje') {
                      {{ p.valor }}%
                    } @else {
                      {{ p.valor | currency: 'ARS' : 'symbol' : '1.0-0' }}
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="acciones">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let p" data-label="">
                    <button mat-icon-button color="warn" (click)="deletePromocion(p)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="promoColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: promoColumns"></tr>
              </table>
              </div>
            </mat-card-content>
          </mat-card>
        }
      </div>
    }
  `,
  styles: `
    .form-layout { display: flex; flex-direction: column; gap: 1.5rem; max-width: 100%; }
    @media (min-width: 768px) { .form-layout { max-width: 720px; } }
    .actions { margin-top: 1rem; }
    .error { color: var(--app-error); }
  `,
})
export class ServicioFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly promoColumns = ['nombre', 'tipo', 'valor', 'acciones'];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly promociones = signal<Promocion[]>([]);

  servicioId: string | null = null;
  isEdit = false;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    descripcion: [''],
    duracion_min: [60, [Validators.required, Validators.min(1)]],
    precio: [0, [Validators.required, Validators.min(0)]],
  });

  readonly promoForm = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    tipo: ['porcentaje' as PromocionTipo, Validators.required],
    valor: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.servicioId = id;
      this.isEdit = true;
      void this.loadServicio(id);
    } else {
      this.loading.set(false);
    }
  }

  private async loadServicio(id: string): Promise<void> {
    const [{ data: serv }, { data: promos }] = await Promise.all([
      this.supabase.client.from('servicios').select('*').eq('id', id).single(),
      this.supabase.client.from('promociones').select('*').eq('servicio_id', id).eq('activo', true),
    ]);

    if (serv) {
      const s = serv as Servicio;
      this.form.patchValue({
        nombre: s.nombre,
        descripcion: s.descripcion ?? '',
        duracion_min: s.duracion_min,
        precio: s.precio,
      });
    }

    this.promociones.set((promos ?? []) as Promocion[]);
    this.loading.set(false);
  }

  async saveServicio(): Promise<void> {
    if (this.form.invalid) return;

    this.saving.set(true);
    this.error.set(null);

    const payload = this.form.getRawValue();

    if (this.isEdit && this.servicioId) {
      const { error } = await this.supabase.client
        .from('servicios')
        .update(payload)
        .eq('id', this.servicioId);

      if (error) {
        this.error.set(error.message);
        this.saving.set(false);
        return;
      }
    } else {
      const { data, error } = await this.supabase.client
        .from('servicios')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        this.error.set(error.message);
        this.saving.set(false);
        return;
      }

      await this.router.navigate(['/servicios', data.id]);
    }

    this.saving.set(false);
  }

  async addPromocion(): Promise<void> {
    if (this.promoForm.invalid || !this.servicioId) return;

    const raw = this.promoForm.getRawValue();
    const { data, error } = await this.supabase.client
      .from('promociones')
      .insert({ ...raw, servicio_id: this.servicioId })
      .select('*')
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    this.promociones.update((list) => [...list, data as Promocion]);
    this.promoForm.reset({ nombre: '', tipo: 'porcentaje', valor: 0 });
  }

  async deletePromocion(promo: Promocion): Promise<void> {
    const { error } = await this.supabase.client
      .from('promociones')
      .update({ activo: false })
      .eq('id', promo.id);

    if (error) {
      alert(error.message);
      return;
    }

    this.promociones.update((list) => list.filter((p) => p.id !== promo.id));
  }
}
