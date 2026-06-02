import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.loading()) {
    return new Promise<boolean | UrlTree>((resolve) => {
      const check = () => {
        if (!auth.loading()) {
          resolve(auth.isAuthenticated() ? true : router.createUrlTree(['/login']));
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return router.createUrlTree(['/']);
  }

  return true;
};
