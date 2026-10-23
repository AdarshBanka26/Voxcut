import React from 'react';
import { Avatar, Icon, LogoMark, VersionPill } from '../components/chrome.jsx';
import { links } from '../router.js';

/** Studio frame from page2: top bar + left "Timeline Dock" sidebar. */
export function StudioShell({ projectId, badge, ratio, active = 'sequencer', children }) {
  const nav = [
    { id: 'sequencer', icon: 'movie_edit', label: 'Sequencer', href: links.studio(projectId) },
    { id: 'projects', icon: 'folder_open', label: 'Projects', href: links.studio() },
    { id: 'export', icon: 'ios_share', label: 'Export & Delivery', href: links.exportPage(projectId) },
    { id: 'templates', icon: 'palette', label: 'Templates', href: links.templates }
  ];
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      <header className="fixed top-0 w-full z-50 bg-surface-container-lowest/90 backdrop-blur-md border-b border-surface-container">
        <div className="h-16 w-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href={links.home} className="flex items-center gap-3">
              <LogoMark />
              <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface font-semibold">Voxcut</span>
              <VersionPill />
            </a>
            <div className="h-4 w-px bg-surface-container hidden sm:block" />
            <span className="hidden sm:inline font-label-pill text-label-pill uppercase text-primary font-semibold tracking-wider">Studio Engine</span>
          </div>
          <div className="flex items-center gap-4">
            <a className="hidden md:inline font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors" href={links.home}>Exit to Web</a>
            <a className="px-5 py-2 rounded-full bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold shadow-cta hover:bg-primary transition-all duration-150" href={links.studio()}>New Project</a>
            <Avatar />
          </div>
        </div>
      </header>
      <aside className="hidden lg:flex fixed left-0 top-16 bottom-0 w-64 bg-surface-container-lowest border-r border-surface-container z-40 flex-col justify-between py-space-md">
        <div className="px-4 flex flex-col gap-6">
          <div className="flex items-center justify-between px-2 text-on-surface-variant">
            <span className="font-label-code text-label-code uppercase tracking-widest">Timeline Dock</span>
            {badge && <span className="font-label-timecode text-label-timecode bg-surface-container px-2 py-0.5 rounded-full">{badge}</span>}
          </div>
          <nav className="flex flex-col gap-1" aria-label="Studio">
            {nav.map(item => (
              <a key={item.id} href={item.href} aria-current={active === item.id ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-body-md text-body-md ${active === item.id ? 'bg-surface-container text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}>
                <Icon name={item.icon} className="text-[20px]" />{item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="px-4">
          <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-label-code text-label-code text-on-surface-variant">{ratio ? 'KEPT OF SOURCE' : 'LOCAL SERVER'}</span>
              <span className="font-label-code text-label-code text-tertiary font-semibold">{ratio ? `${Math.round(ratio * 100)}%` : 'ONLINE'}</span>
            </div>
            <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
              <div className="bg-tertiary h-full transition-all" style={{ width: `${Math.round((ratio ?? 1) * 100)}%` }} />
            </div>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <main className="w-full pt-16 bg-surface-bright min-h-screen">{children}</main>
      </div>
    </div>
  );
}

export function SaveIndicator({ save }) {
  const map = {
    saving: ['bg-amber-500 animate-pulse', 'Saving…'],
    saved: ['bg-tertiary', 'Saved'],
    error: ['bg-error', 'Save failed']
  };
  const [dot, label] = map[save.state] ?? map.saved;
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="font-label-code text-label-code text-on-surface-variant">{label}</span>
    </div>
  );
}
