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
    // Public: works signed out (preview), accept needs a session.
    path: 'join/:code',
    title: 'Join a building · Condo',
    loadComponent: () => import('./pages/join.page').then((m) => m.JoinPage),
  },
  {
    // Printed QR labels point here. Sign-in required; authGuard brings people back after login.
    path: 'r/:assetId',
    canActivate: [authGuard],
    title: 'Report a problem · Condo',
    loadComponent: () => import('./pages/resolve-asset.page').then((m) => m.ResolveAssetPage),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    title: 'Notifications · Condo',
    loadComponent: () => import('./pages/notifications.page').then((m) => m.NotificationsPage),
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
        path: 'issues',
        title: 'Issues · Condo',
        loadComponent: () => import('./building/issues.page').then((m) => m.IssuesPage),
      },
      {
        path: 'issues/new',
        title: 'Report a problem · Condo',
        loadComponent: () => import('./building/report-issue.page').then((m) => m.ReportIssuePage),
      },
      {
        path: 'issues/:issueId',
        title: 'Issue · Condo',
        loadComponent: () => import('./building/issue-detail.page').then((m) => m.IssueDetailPage),
      },
      {
        path: 'assets/labels',
        title: 'QR labels · Condo',
        loadComponent: () => import('./building/labels.page').then((m) => m.LabelsPage),
      },
      {
        path: 'assets',
        title: 'Assets · Condo',
        loadComponent: () => import('./building/assets.page').then((m) => m.AssetsPage),
      },
      {
        path: 'catalog/other',
        title: 'Review “Other” · Condo',
        loadComponent: () => import('./building/other-review.page').then((m) => m.OtherReviewPage),
      },
      {
        path: 'catalog',
        title: 'Problem catalog · Condo',
        loadComponent: () => import('./building/catalog.page').then((m) => m.CatalogPage),
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
