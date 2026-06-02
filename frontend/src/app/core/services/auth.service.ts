import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Session, User } from '@supabase/supabase-js';
import { Profile, UserRole } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  private readonly _session = signal<Session | null>(null);
  private readonly _user = signal<User | null>(null);
  private readonly _profile = signal<Profile | null>(null);
  private readonly _loading = signal(true);

  readonly session = this._session.asReadonly();
  readonly user = this._user.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => !!this._session());
  readonly role = computed(() => this._profile()?.rol ?? null);
  readonly fullName = computed(() => {
    const p = this._profile();
    return p ? `${p.nombre} ${p.apellido}` : '';
  });

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    await this.applySession(data.session);

    this.supabase.client.auth.onAuthStateChange(async (_event, session) => {
      await this.applySession(session);
    });
  }

  private async applySession(session: Session | null): Promise<void> {
    this._session.set(session);
    this._user.set(session?.user ?? null);

    if (session?.user) {
      await this.loadProfile(session.user.id);
    } else {
      this._profile.set(null);
    }

    this._loading.set(false);
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error cargando perfil:', error.message);
      this._profile.set(null);
      return;
    }

    this._profile.set(data as Profile);
  }

  async login(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async logout(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this._profile.set(null);
    await this.router.navigate(['/login']);
  }

  hasRole(...roles: UserRole[]): boolean {
    const current = this.role();
    return !!current && roles.includes(current);
  }

  isAdmin(): boolean {
    return this.hasRole('admin');
  }

  isStaff(): boolean {
    return this.isAuthenticated() && !!this._profile()?.activo;
  }

  canManageClientes(): boolean {
    return this.hasRole('admin', 'recepcion');
  }

  canManageServicios(): boolean {
    return this.hasRole('admin', 'recepcion');
  }

  canManagePersonal(): boolean {
    return this.hasRole('admin');
  }
}
