import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { LoginComponent } from './features/auth/login.component';
import { ClientesListComponent } from './features/clientes/clientes-list.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { PersonalDetailComponent } from './features/personal/personal-detail.component';
import { PersonalListComponent } from './features/personal/personal-list.component';
import { ServicioFormComponent } from './features/servicios/servicio-form.component';
import { ServiciosListComponent } from './features/servicios/servicios-list.component';
import { TurnosCalendarComponent } from './features/turnos/turnos-calendar.component';
import { MainLayoutComponent } from './layout/main-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard],
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'turnos', component: TurnosCalendarComponent },
      {
        path: 'clientes',
        component: ClientesListComponent,
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'servicios',
        component: ServiciosListComponent,
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'servicios/:id',
        component: ServicioFormComponent,
        canActivate: [roleGuard(['admin', 'recepcion'])],
      },
      {
        path: 'personal',
        component: PersonalListComponent,
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'personal/:id',
        component: PersonalDetailComponent,
        canActivate: [roleGuard(['admin'])],
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
