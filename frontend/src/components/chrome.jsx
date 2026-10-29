import React, { useEffect, useRef, useState } from 'react';
import { links } from '../router.js';
import { logout, useSession } from '../auth.js';

export function Icon({ name, className = '', filled = false, label }) {
  return (
    <span className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>
      {name}
    </span>
  );
}

export function LogoMark({ className = 'h-8 w-8' }) {
  return <img alt="Voxcut" className={`${className} rounded-lg object-cover`} src="/assets/voxcut-logo.png" />;
}

export function VersionPill() {
  return <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-code text-label-code text-on-surface-variant">v2.4</span>;
}

/** Signed in: initial + account menu. Signed out: link to the login page. */
export function Avatar() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (session.status !== 'authenticated') {
    return (
      <a href="#/login" title="Sign in" aria-label="Sign in" className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
        <Icon name="person" className="text-on-primary text-[18px]" />
      </a>
    );
  }
  const { user } = session;
  const signOut = async all => {
    setOpen(false);
    await logout({ all }).catch(() => {});
    window.location.hash = '#/login';
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${user.name}`}
        className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-body-md text-body-md font-semibold">
        {user.name.trim().charAt(0).toUpperCase() || '?'}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl bg-surface-container-lowest shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-surface-container p-2 z-[60]">
          <div className="px-3 py-2 border-b border-surface-container mb-1">
            <p className="font-body-md text-body-md font-semibold truncate">{user.name}</p>
            <p className="font-label-code text-label-code text-on-surface-variant truncate">{user.email}</p>
          </div>
          <a role="menuitem" href={links.studio()} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container-low font-body-md text-body-md"><Icon name="folder_open" className="text-[18px]" />My projects</a>
          <button role="menuitem" onClick={() => signOut(false)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container-low font-body-md text-body-md text-left"><Icon name="logout" className="text-[18px]" />Sign out</button>
          <button role="menuitem" onClick={() => signOut(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-error-container text-error font-body-md text-body-md text-left"><Icon name="devices" className="text-[18px]" />Sign out of all devices</button>
        </div>
      )}
    </div>
  );
}

/** Primary header CTA: register when signed out, open the studio when signed in. */
export function StartLink({ className, children = 'Start Free' }) {
  const session = useSession();
  const signedIn = session.status === 'authenticated';
  return <a className={className} href={signedIn ? links.studio() : '#/register'}>{signedIn ? 'Open Studio' : children}</a>;
}

const NAV = [
  { id: 'features', label: 'Features', href: '#features' },
  { id: 'showcase', label: 'Showcase', href: '#showcase' },
  { id: 'templates', label: 'Templates', href: links.templates },
  { id: 'pricing', label: 'Pricing', href: links.exportPage() }
];

/** Product header used by the Templates and Export pages (page3 / page4). */
export function SiteHeader({ active }) {
  return (
    <header className="fixed top-0 w-full z-50 bg-surface-container-lowest/90 backdrop-blur-md border-b border-surface-container">
      <div className="h-16 w-full px-margin-mobile md:px-margin flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href={links.home} className="flex items-center gap-3">
            <LogoMark />
            <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface font-semibold">Voxcut</span>
            <VersionPill />
          </a>
          <nav className="hidden lg:flex items-center gap-8" aria-label="Main">
            {NAV.map(item => (
              <a key={item.id} href={item.href}
                aria-current={active === item.id ? 'page' : undefined}
                className={active === item.id
                  ? 'font-body-md text-body-md transition-colors text-primary font-semibold'
                  : 'font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors'}>
                {item.label}
              </a>
            ))}
            <div className="h-4 w-px bg-surface-container" />
            <a className="font-body-md text-body-md text-secondary hover:text-secondary-container transition-colors flex items-center gap-1.5" href={links.studio()}>Video Editor</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <StartLink className="px-5 py-2 rounded-full bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold shadow-cta hover:bg-primary transition-all duration-150" />
          <Avatar />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="w-full bg-surface-container-lowest border-t border-surface-container py-space-xl">
      <div className="w-full px-margin-mobile md:px-margin flex flex-col md:flex-row items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LogoMark className="h-6 w-6" />
          <span className="font-headline-sm text-body-lg text-on-surface font-semibold">Voxcut</span>
          <span className="font-label-timecode text-label-timecode text-on-surface-variant">© 2026 Voxcut. Edit the text. Rewrite the video.</span>
        </div>
        <div className="flex items-center gap-6">
          <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors" href={links.home}>Overview</a>
          <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors" href={links.templates}>Presets</a>
          <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors" href={links.exportPage()}>Export</a>
          <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors" href={links.studio()}>Studio Console</a>
        </div>
      </div>
    </footer>
  );
}

/** Inline, dismissable error/notice banner (SRS §9.3 actionable errors). */
export function Notice({ tone = 'error', title, children, onClose, actions }) {
  const tones = {
    error: 'bg-error-container text-on-error-container',
    warning: 'bg-amber-50 text-amber-900 border border-amber-200',
    info: 'bg-secondary-fixed text-on-secondary-fixed'
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 flex items-start gap-3 ${tones[tone]}`}>
      <Icon name={tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'info'} className="text-[20px] mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-body-md text-body-md font-semibold">{title}</p>}
        <div className="font-body-sm text-body-sm">{children}</div>
        {actions && <div className="flex flex-wrap gap-2 mt-2">{actions}</div>}
      </div>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><Icon name="close" className="text-[18px]" /></button>}
    </div>
  );
}
