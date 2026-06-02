import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'turnos',
        loadComponent: () =>
          import('./features/turnos/turnos-calendar.component').then((m) => m.TurnosCalendarComponent),
      },
      {
        path: 'clientes',
        loadComponent: () =>
          import('./features/clientes/clientes-list.component').then((m) => m.ClientesListComponent),
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'servicios',
        loadComponent: () =>
          import('./features/servicios/servicios-list.component').then((m) => m.ServiciosListComponent),
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'servicios/:id',
        loadComponent: () =>
          import('./features/servicios/servicio-form.component').then((m) => m.ServicioFormComponent),
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'personal',
        loadComponent: () =>
          import('./features/personal/personal-list.component').then((m) => m.PersonalListComponent),
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'personal/:id',
        loadComponent: () =>
          import('./features/personal/personal-detail.component').then((m) => m.PersonalDetailComponent),
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'cobros',
        loadComponent: () =>
          import('./features/cobros/cobros-list.component').then((m) => m.CobrosListComponent),
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'marketing',
        loadComponent: () =>
          import('./features/marketing/marketing.component').then((m) => m.MarketingComponent),
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/configuracion/configuracion.component').then((m) => m.ConfiguracionComponent),
        canActivate: [roleGuard(['admin'])],
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
