import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class GcalService {
  private readonly supabase = inject(SupabaseService);

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
    return `${environment.supabaseUrl}/functions/v1/gcal-oauth`;
  }
}
