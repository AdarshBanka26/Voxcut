import React from 'react';
import { links } from '../router.js';

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

export function Avatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center" title="Local workspace">
      <Icon name="person" className="text-on-primary text-[18px]" />
    </div>
  );
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
          <a className="px-5 py-2 rounded-full bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold shadow-cta hover:bg-primary transition-all duration-150" href={links.studio()}>Start Free</a>
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
