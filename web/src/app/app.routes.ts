import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buildings' },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Condo',
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Create account · Condo',
    loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'buildings',
    canActivate: [authGuard],
    title: 'Buildings · Condo',
    loadComponent: () => import('./pages/buildings.page').then((m) => m.BuildingsPage),
  },
  {
    path: 'buildings/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./building/building-shell.component').then((m) => m.BuildingShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'structure' },
      {
        path: 'structure',
        title: 'Structure · Condo',
        loadComponent: () => import('./building/structure.page').then((m) => m.StructurePage),
      },
      {
        path: 'members',
        title: 'Members · Condo',
        loadComponent: () => import('./building/members.page').then((m) => m.MembersPage),
      },
      {
        path: 'settings',
        title: 'Settings · Condo',
        loadComponent: () => import('./building/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: 'buildings' },
];
