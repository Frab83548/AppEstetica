import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-page">
      <button mat-icon-button class="theme-btn" (click)="theme.toggle()" aria-label="Cambiar tema">
        <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>

      <mat-card class="login-card">
        <div class="login-header">
          <mat-icon class="logo">auto_awesome</mat-icon>
          <h1>AppEstetica</h1>
          <p>Ingresá a tu cuenta</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Correo electrónico</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" />
            <mat-icon matPrefix>mail</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Contraseña</mat-label>
            <input
              matInput
              [type]="hidePassword() ? 'password' : 'text'"
              formControlName="password"
              autocomplete="current-password"
            />
            <mat-icon matPrefix>lock</mat-icon>
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="hidePassword.set(!hidePassword())"
            >
              <mat-icon>{{ hidePassword() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
          </mat-form-field>

          @if (error()) {
            <p class="error-msg">{{ error() }}</p>
          }

          <button
            mat-flat-button
            color="primary"
            class="submit-btn"
            type="submit"
            [disabled]="form.invalid || loading()"
          >
            @if (loading()) {
              <mat-spinner diameter="20" />
            } @else {
              Iniciar sesión
            }
          </button>
        </form>
      </mat-card>
    </div>
  `,
  styles: `
    .login-page {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
        max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      background: var(--app-bg);
      position: relative;
      overflow-x: hidden;
    }

    .theme-btn {
      position: absolute;
      top: max(0.75rem, env(safe-area-inset-top));
      right: max(0.75rem, env(safe-area-inset-right));
    }

    .login-card {
      width: 100%;
      max-width: min(400px, 100%);
      padding: clamp(1.25rem, 4vw, 2rem);
    }

    .login-header {
      text-align: center;
      margin-bottom: 1.5rem;

      .logo {
        font-size: clamp(2rem, 6vw, 2.5rem);
        width: clamp(2rem, 6vw, 2.5rem);
        height: clamp(2rem, 6vw, 2.5rem);
        color: var(--app-accent);
      }

      h1 {
        margin: 0.5rem 0 0;
        font-size: var(--text-h1);
        font-weight: 600;
      }

      p {
        margin: 0.25rem 0 0;
        color: var(--app-text-muted);
      }
    }

    .full-width {
      width: 100%;
      margin-bottom: 0.5rem;
    }

    .submit-btn {
      width: 100%;
      min-height: var(--touch-min);
      margin-top: 0.5rem;
    }

    .error-msg {
      color: var(--app-error);
      font-size: 0.875rem;
      margin: 0 0 0.5rem;
    }
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  readonly hidePassword = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();
    const { error } = await this.auth.login(email, password);

    this.loading.set(false);

    if (error) {
      this.error.set(error);
      return;
    }

    await this.router.navigate(['/dashboard']);
  }
}
