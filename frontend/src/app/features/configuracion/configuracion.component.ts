import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { GcalService, GcalSetupStatus } from '../../core/services/gcal.service';
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
    MatIconModule,
    MatListModule,
    RouterLink,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Configuración</h1>
        <p class="subtitle">Políticas, integraciones y datos del negocio</p>
      </div>
    </div>

    @if (loading()) {
      <div class="loading"><mat-spinner /></div>
    } @else {
      <mat-card class="config-card gcal-card">
        <h3>Google Calendar — guía de configuración</h3>

        <mat-list class="checklist">
          <mat-list-item>
            <mat-icon matListItemIcon [class.done]="gcalStatus()?.credentialsConfigured">
              {{ gcalStatus()?.credentialsConfigured ? 'check_circle' : 'radio_button_unchecked' }}
            </mat-icon>
            <span matListItemTitle>1. Credenciales OAuth en Google Cloud</span>
            <span matListItemLine>Client ID + Secret guardados en la app</span>
          </mat-list-item>
          <mat-list-item>
            <mat-icon matListItemIcon [class.done]="gcalStatus()?.accountConnected">
              {{ gcalStatus()?.accountConnected ? 'check_circle' : 'radio_button_unchecked' }}
            </mat-icon>
            <span matListItemTitle>2. Cuenta Google autorizada</span>
            <span matListItemLine>Token de acceso al calendario del negocio</span>
          </mat-list-item>
          <mat-list-item>
            <mat-icon matListItemIcon [class.done]="profesionalesOk()">
              {{ profesionalesOk() ? 'check_circle' : 'radio_button_unchecked' }}
            </mat-icon>
            <span matListItemTitle>3. Calendario por profesional</span>
            <span matListItemLine>
              {{ gcalStatus()?.professionalsWithCalendar ?? 0 }}/{{ gcalStatus()?.professionalsTotal ?? 0 }} con Calendar ID
            </span>
          </mat-list-item>
        </mat-list>

        @if (gcalStatus()?.accountConnected) {
          <p class="banner ok"><mat-icon>verified</mat-icon> Integración activa. Los turnos se sincronizan al crear o editar.</p>
          <button mat-stroked-button type="button" (click)="desconectar()">Desconectar cuenta Google</button>
        }

        <details class="cloud-help" [open]="!gcalStatus()?.credentialsConfigured">
          <summary>Google Cloud Console (solo la primera vez)</summary>
          <ol>
            <li>Activar <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">Google Calendar API</a>.</li>
            <li>Crear credencial OAuth tipo <strong>Aplicación web</strong>.</li>
            <li>En <strong>URIs de redirección autorizados</strong>, pegar exactamente:</li>
          </ol>
          <code class="uri-box">{{ gcal.defaultRedirectUri }}</code>
          <p class="hint">En modo <em>Testing</em>, agregá tu Gmail en <strong>Pantalla de consentimiento → Usuarios de prueba</strong>.</p>
        </details>

        <form [formGroup]="googleForm" class="form-grid">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Client ID</mat-label>
            <input matInput formControlName="client_id" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Client Secret</mat-label>
            <input matInput type="password" formControlName="client_secret" autocomplete="new-password"
              [placeholder]="googleSecretSaved() ? 'Dejar vacío para mantener el actual' : ''" />
          </mat-form-field>
          <div class="actions form-actions">
            <button mat-flat-button color="primary" type="button" [disabled]="savingGoogle()" (click)="guardarGoogle()">
              Guardar credenciales
            </button>
            @if (googleSecretSaved() && !gcalStatus()?.accountConnected) {
              <a mat-stroked-button [href]="gcal.getOAuthUrl()" target="_blank" rel="noopener" (click)="onConnectClick()">
                <mat-icon>link</mat-icon>
                Conectar cuenta Google
              </a>
            }
            <a mat-button routerLink="/personal">Configurar calendarios por profesional</a>
          </div>
        </form>
      </mat-card>

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
          <button mat-flat-button color="primary" [disabled]="saving()" (click)="guardar()">Guardar política</button>
        </form>
      </mat-card>
    }
  `,
  styles: `
    .config-card { padding: clamp(1rem, 3vw, 1.25rem); max-width: 100%; margin-bottom: 1.5rem; }
    @media (min-width: 768px) { .config-card { max-width: 45rem; } }
    .config-card h3 { margin: 0 0 0.75rem; font-size: var(--text-h3); }
    .gcal-card { border-left: 4px solid var(--app-accent); }
    .checklist mat-icon { color: var(--app-text-muted); }
    .checklist mat-icon.done { color: #2e7d32; }
    .banner { display: flex; align-items: center; gap: 0.35rem; padding: 0.75rem 1rem; border-radius: 0.5rem; margin: 0 0 1rem; flex-wrap: wrap; }
    .banner.ok { background: var(--app-surface-hover); color: var(--app-text); border: 1px solid var(--app-border); }
    .cloud-help { margin: 1rem 0; font-size: 0.9rem; color: var(--app-text-muted); }
    .cloud-help summary { cursor: pointer; font-weight: 500; color: inherit; margin-bottom: 0.5rem; }
    .cloud-help ol { margin: 0.5rem 0; padding-left: 1.25rem; }
    .uri-box { display: block; background: var(--app-surface-hover); padding: 0.6rem; border-radius: 0.375rem; word-break: break-all; font-size: 0.8rem; margin: 0.5rem 0; border: 1px solid var(--app-border); }
    .hint { margin: 0.5rem 0 0; font-size: 0.85rem; }
    .form-grid { margin-top: 1rem; }
  `,
})
export class ConfiguracionComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  readonly gcal = inject(GcalService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingGoogle = signal(false);
  readonly googleSecretSaved = signal(false);
  readonly gcalStatus = signal<GcalSetupStatus | null>(null);

  form = this.fb.group({
    horas_minimas: [24, [Validators.required, Validators.min(0)]],
    permitir_no_show: [true],
    mensaje: ['', Validators.required],
  });

  googleForm = this.fb.group({
    client_id: ['', Validators.required],
    client_secret: [''],
    redirect_uri: [this.gcal.defaultRedirectUri, Validators.required],
  });

  ngOnInit(): void {
    void this.load();
  }

  profesionalesOk(): boolean {
    const s = this.gcalStatus();
    return !!s && s.professionalsTotal > 0 && s.professionalsWithCalendar === s.professionalsTotal;
  }

  private async load(): Promise<void> {
    this.loading.set(true);

    const [{ data: politica }, oauth, status] = await Promise.all([
      this.supabase.client.from('configuracion').select('valor').eq('clave', 'politica_cancelacion').maybeSingle(),
      this.gcal.getOAuthConfig(),
      this.gcal.getSetupStatus(),
    ]);

    if (politica?.valor) {
      const v = politica.valor as { horas_minimas: number; permitir_no_show: boolean; mensaje: string };
      this.form.patchValue(v);
    }

    this.googleForm.patchValue({
      client_id: oauth.client_id,
      redirect_uri: oauth.redirect_uri,
    });
    this.googleSecretSaved.set(oauth.configured);
    this.gcalStatus.set(status);

    this.loading.set(false);
  }

  async guardarGoogle(): Promise<void> {
    if (this.googleForm.get('client_id')?.invalid) return;
    this.savingGoogle.set(true);
    try {
      const { client_id, client_secret, redirect_uri } = this.googleForm.getRawValue();
      await this.gcal.saveOAuthConfig(client_id ?? '', client_secret ?? '', redirect_uri ?? '');
      this.googleSecretSaved.set(true);
      this.googleForm.patchValue({ client_secret: '' });
      this.gcalStatus.set(await this.gcal.getSetupStatus());
    } finally {
      this.savingGoogle.set(false);
    }
  }

  onConnectClick(): void {
    setTimeout(() => void this.refreshGcalStatus(), 8000);
  }

  async refreshGcalStatus(): Promise<void> {
    this.gcalStatus.set(await this.gcal.getSetupStatus());
  }

  async desconectar(): Promise<void> {
    await this.gcal.disconnect();
    this.gcalStatus.set(await this.gcal.getSetupStatus());
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
