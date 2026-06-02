import { MatDialogConfig } from '@angular/material/dialog';

export const APP_DIALOG_CONFIG: MatDialogConfig = {
  maxWidth: '95vw',
  maxHeight: '90dvh',
  panelClass: 'app-dialog-panel',
  autoFocus: 'first-titled-element',
};

export function appDialogConfig(overrides: MatDialogConfig = {}): MatDialogConfig {
  return { ...APP_DIALOG_CONFIG, ...overrides };
}
