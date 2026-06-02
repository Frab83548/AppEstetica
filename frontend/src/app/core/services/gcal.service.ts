import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface GoogleOAuthConfig {
  client_id: string;
  client_secret?: string;
  redirect_uri: string;
  configured: boolean;
}

export interface GcalSetupStatus {
  credentialsConfigured: boolean;
  accountConnected: boolean;
  professionalsTotal: number;
  professionalsWithCalendar: number;
  oauthUrl: string;
  redirectUri: string;
}

@Injectable({ providedIn: 'root' })
export class GcalService {
  private readonly supabase = inject(SupabaseService);

  readonly defaultRedirectUri = `${environment.supabaseUrl}/functions/v1/gcal-oauth`;

  async syncTurno(turnoId: string, action: 'upsert' | 'delete' = 'upsert'): Promise<void> {
    try {
      await this.supabase.client.functions.invoke('gcal-sync', {
        body: { turno_id: turnoId, action },
      });
    } catch {
      // Google Calendar opcional; no bloquear flujo principal
    }
  }

  getOAuthUrl(): string {
    return this.defaultRedirectUri;
  }

  async isConnected(): Promise<boolean> {
    const { count } = await this.supabase.client
      .from('google_calendar_tokens')
      .select('*', { count: 'exact', head: true });
    return (count ?? 0) > 0;
  }

  async getOAuthConfig(): Promise<GoogleOAuthConfig> {
    const { data } = await this.supabase.client
      .from('configuracion')
      .select('valor')
      .eq('clave', 'google_oauth')
      .maybeSingle();

    const v = data?.valor as { client_id?: string; client_secret?: string; redirect_uri?: string } | null;
    const client_id = v?.client_id ?? '';
    return {
      client_id,
      redirect_uri: v?.redirect_uri ?? this.defaultRedirectUri,
      configured: Boolean(client_id && v?.client_secret),
    };
  }

  async saveOAuthConfig(clientId: string, clientSecret: string, redirectUri: string): Promise<void> {
    const { data: existing } = await this.supabase.client
      .from('configuracion')
      .select('valor')
      .eq('clave', 'google_oauth')
      .maybeSingle();

    const prev = existing?.valor as { client_secret?: string } | null;
    const secret = clientSecret.trim() || prev?.client_secret;
    if (!clientId.trim() || !secret) {
      throw new Error('Client ID y Client Secret son obligatorios');
    }

    await this.supabase.client.from('configuracion').upsert({
      clave: 'google_oauth',
      valor: {
        client_id: clientId.trim(),
        client_secret: secret,
        redirect_uri: redirectUri.trim() || this.defaultRedirectUri,
      },
    });
  }

  async disconnect(): Promise<void> {
    await this.supabase.client.from('google_calendar_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  async getSetupStatus(): Promise<GcalSetupStatus> {
    const [oauth, connected, profRes] = await Promise.all([
      this.getOAuthConfig(),
      this.isConnected(),
      this.supabase.client
        .from('profesionales')
        .select('id, google_calendar_id')
        .eq('activo', true)
        .is('deleted_at', null),
    ]);

    const professionals = profRes.data ?? [];
    const withCalendar = professionals.filter((p) => Boolean(p.google_calendar_id?.trim())).length;

    return {
      credentialsConfigured: oauth.configured,
      accountConnected: connected,
      professionalsTotal: professionals.length,
      professionalsWithCalendar: withCalendar,
      oauthUrl: this.defaultRedirectUri,
      redirectUri: oauth.redirect_uri,
    };
  }
}
