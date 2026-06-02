import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, Subscription } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { USER_ROLE_LABELS } from '../core/models';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: ('admin' | 'recepcion' | 'profesional')[];
}

@Component({
  selector: 'app-main-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnDestroy {
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private navSub?: Subscription;
  readonly theme = inject(ThemeService);

  readonly sidenavOpen = signal(false);
  readonly isMobileNav = toSignal(
    this.breakpoint.observe(['(max-width: 1023px)']).pipe(map((r) => r.matches)),
    { initialValue: true },
  );

  constructor() {
    this.navSub = this.breakpoint
      .observe(['(max-width: 1023px)', '(min-width: 1024px)'])
      .subscribe((state) => {
        if (state.breakpoints['(min-width: 1024px)']) {
          this.sidenavOpen.set(true);
        } else if (state.breakpoints['(max-width: 1023px)']) {
          this.sidenavOpen.set(false);
        }
      });
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
  }

  readonly navItems: NavItem[] = [
    { label: 'Panel', icon: 'dashboard', route: '/dashboard' },
    { label: 'Turnos', icon: 'calendar_month', route: '/turnos' },
    { label: 'Clientes', icon: 'people', route: '/clientes', roles: ['admin', 'recepcion'] },
    { label: 'Servicios', icon: 'spa', route: '/servicios', roles: ['admin', 'recepcion'] },
    { label: 'Cobros', icon: 'payments', route: '/cobros', roles: ['admin', 'recepcion'] },
    { label: 'Reportes', icon: 'assessment', route: '/reportes', roles: ['admin', 'recepcion'] },
    { label: 'Marketing', icon: 'campaign', route: '/marketing', roles: ['admin'] },
    { label: 'Personal', icon: 'badge', route: '/personal', roles: ['admin'] },
    { label: 'Configuración', icon: 'settings', route: '/configuracion', roles: ['admin'] },
  ];

  readonly visibleNav = computed(() => {
    const role = this.auth.role();
    return this.navItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
  });

  readonly profile = this.auth.profile;
  readonly fullName = this.auth.fullName;
  readonly roleLabel = computed(() => {
    const rol = this.auth.role();
    return rol ? USER_ROLE_LABELS[rol] : '';
  });

  toggleSidenav(): void {
    this.sidenavOpen.update((v) => !v);
  }

  closeSidenavOnMobile(): void {
    if (this.isMobileNav()) {
      this.sidenavOpen.set(false);
    }
  }

  logout(): void {
    void this.auth.logout();
  }
}
