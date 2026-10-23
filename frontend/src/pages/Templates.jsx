import React, { useState } from 'react';
import { Icon, SiteFooter, SiteHeader } from '../components/chrome.jsx';
import { links } from '../router.js';

const FILTERS = ['All Assets', 'YouTube Documentaries', 'Reels & TikTok', 'Cinema LUTs', 'Soundscapes', 'Motion Titles'];

const CARDS = [
  {
    img: '/assets/art-sunset.jpg', alt: 'Golden Hour 35mm Horizon LUT Pack', tags: ['Cinema LUTs', 'YouTube Documentaries'],
    badge: 'Cinema LUT · .CUBE', badgeCls: 'bg-primary-container text-on-primary-container', spec: 'KODAK 250D EMULATION',
    category: 'Color Grade Preset', categoryCls: 'text-primary', meta: 'v3.2 Updated', hover: 'group-hover:text-primary',
    title: 'Golden Hour 35mm LUT Pack',
    desc: 'Dual-tone twilight split with ultra-fine halation roll-off. Balanced specifically for saturated ocean horizons, anamorphic flares, and glowing skintones.',
    footIcon: 'filter_vintage', footIconCls: 'text-primary', foot: 'Includes 12 Varied Curves',
    action: 'Apply to Timeline', actionIcon: 'arrow_forward', actionCls: 'bg-primary-container text-on-primary-container hover:bg-primary shadow-cta',
    overlay: 'swatches'
  },
  {
    img: '/assets/art-fish.jpg', alt: 'Oceanic Noir Soundscape and Grade', tags: ['Soundscapes', 'YouTube Documentaries'],
    badge: 'Audio Stem + LUT Bundle', badgeCls: 'bg-secondary-container text-on-secondary-container', spec: '24-BIT / 96KHZ LOSSLESS',
    category: 'Atmosphere Master', categoryCls: 'text-secondary', meta: 'Full Commercial Rights', hover: 'group-hover:text-secondary',
    title: 'Oceanic Noir Soundscape & Grade',
    desc: 'Sub-aquatic sub-bass drones paired with cold indigo deep-water film curves. Engineered for wildlife documentaries, deep-dive investigative journalism, and thriller edits.',
    footIcon: 'graphic_eq', footIconCls: 'text-secondary', foot: 'Binaural Stems Included',
    action: 'Preview Stems', actionIcon: 'headphones', actionCls: 'bg-secondary text-on-secondary hover:bg-secondary-container shadow-cta-blue',
    overlay: 'player'
  },
  {
    img: '/assets/art-vinyl.jpg', alt: 'Vinyl Lofi Beats and Grain Overlay', tags: ['Soundscapes', 'Reels & TikTok'],
    badge: 'Analog Grain + Loops', badgeCls: 'bg-surface-container-high text-on-surface', spec: 'BPM: 85 · KEY: D MINOR',
    category: 'Audio & Overlay Asset', categoryCls: 'text-on-surface-variant', meta: 'Seamless Loop', hover: 'group-hover:text-primary',
    title: 'Vinyl Lofi Beats & Grain Overlay',
    desc: 'Organic record-crackle audio layers combined with a procedural cyan-tinted water ripple overlay. Perfect for chill livestreams, tutorial intros, and podcast bumpers.',
    footIcon: 'motion_photos_on', footIconCls: 'text-outline', foot: 'Alpha Mattes Ready',
    action: 'Drop in Sequencer', actionIcon: 'add_circle', actionCls: 'bg-surface-container-high text-on-surface hover:bg-surface-container',
    overlay: 'loop'
  },
  {
    img: '/assets/art-clouds.jpg', alt: 'Dynamic Motion Tracking and Kinetic Titles', tags: ['Motion Titles', 'Reels & TikTok'],
    badge: 'Motion Graphics · 4K 60FPS', badgeCls: 'bg-tertiary-container text-on-tertiary-container', spec: 'AI POINT TRACKING',
    category: 'Kinetic Overlay Kit', categoryCls: 'text-tertiary', meta: 'Auto-Keyframed', hover: 'group-hover:text-tertiary',
    title: 'Dynamic Motion Tracking & Kinetic Titles',
    desc: 'Vibrant topo-map contour badges and path trace animations. Locked to subjects via an optical-flow engine for outdoor sports, travel, and action cutdowns.',
    footIcon: 'hub', footIconCls: 'text-tertiary', foot: '8 Callout Archetypes',
    action: 'Inspect Tracking', actionIcon: 'visibility', actionCls: 'bg-tertiary text-on-tertiary hover:bg-tertiary-container shadow-cta-green',
    overlay: 'tracking'
  }
];

function Overlay({ kind }) {
  if (kind === 'swatches') {
    return (
      <div className="absolute bottom-4 left-4 flex items-center gap-1.5 p-1.5 rounded-lg bg-surface-container-lowest/80 backdrop-blur-md shadow-sm">
        <div className="w-5 h-5 rounded bg-primary" /><div className="w-5 h-5 rounded bg-secondary" /><div className="w-5 h-5 rounded bg-tertiary-fixed" /><div className="w-5 h-5 rounded bg-surface-container-highest" />
        <span className="font-label-code text-label-code text-on-surface px-1">REC.709</span>
      </div>
    );
  }
  if (kind === 'player') {
    return (
      <div className="absolute bottom-4 left-4 right-4 p-2.5 rounded-lg bg-surface-container-lowest/85 backdrop-blur-md shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center"><Icon name="play_arrow" className="text-[18px]" /></span>
          <div className="flex flex-col">
            <span className="font-label-pill text-label-pill text-on-surface font-bold">Abyssal Drift (Ambient Bed)</span>
            <span className="font-label-timecode text-label-timecode text-on-surface-variant">03:42 · Modular Hydro-Synthesis</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-0.5 h-6">
          {['h-3', 'h-5', 'h-2', 'h-6 bg-secondary-container', 'h-4', 'h-5 bg-secondary-container', 'h-2', 'h-3'].map((h, i) => <span key={i} className={`w-1 rounded-full ${h.includes('bg-') ? h : `${h} bg-secondary`}`} />)}
        </div>
      </div>
    );
  }
  if (kind === 'loop') {
    return (
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between p-2 rounded-lg bg-surface-container-lowest/90 backdrop-blur-md">
        <div className="flex items-center gap-2"><Icon name="album" className="text-primary text-[20px]" /><span className="font-label-pill text-label-pill text-on-surface font-semibold">16mm Dust &amp; Scratch Texture Scan (4K ProRes)</span></div>
        <span className="font-label-code text-label-code text-on-surface-variant">LOOP READY</span>
      </div>
    );
  }
  return (
    <div className="absolute top-1/2 left-1/4 -translate-y-1/2 flex items-center gap-1 p-1.5 rounded bg-surface-container-lowest/90 backdrop-blur shadow-sm">
      <span className="w-2 h-2 rounded-full bg-tertiary-container animate-ping" />
      <span className="font-label-code text-[10px] text-on-surface uppercase">Rider 01 · Elevation +1,420m</span>
    </div>
  );
}

export default function Templates() {
  const [filter, setFilter] = useState('All Assets');
  const [sort, setSort] = useState('Curator Picks');
  let cards = filter === 'All Assets' ? CARDS : CARDS.filter(c => c.tags.includes(filter));
  if (sort === 'A–Z') cards = [...cards].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased">
      <SiteHeader active="templates" />
      <main className="w-full pt-16 bg-surface-bright min-h-screen">
        <section className="w-full px-margin-mobile md:px-margin pt-space-xl pb-space-lg">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-space-lg pb-space-lg">
            <div className="flex flex-col max-w-2xl">
              <div className="flex items-center gap-2 mb-space-xs">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-widest">Studio Vault · 2026 Edition</span>
              </div>
              <h1 className="font-headline-lg text-headline-lg md:text-display-hero text-on-surface tracking-tight leading-none mb-space-sm">Curated Templates &amp; Cinematic Assets</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">Jumpstart your timeline with director-grade presets, color grades, and pristine audio stems designed for high-caliber storytelling.</p>
            </div>
            <div className="flex items-center gap-space-md p-space-sm rounded-xl bg-surface-container-low shadow-sm self-start md:self-auto">
              <div className="flex flex-col px-space-xs"><span className="font-label-timecode text-label-timecode text-on-surface-variant">PRESETS LOADED</span><span className="font-headline-sm text-headline-sm text-on-surface">1,480+</span></div>
              <div className="w-px h-8 bg-surface-variant" />
              <div className="flex flex-col px-space-xs"><span className="font-label-timecode text-label-timecode text-on-surface-variant">RENDER FORMAT</span><span className="font-headline-sm text-headline-sm text-secondary">ProRes 422</span></div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto pt-space-md flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2" role="tablist" aria-label="Filter assets">
              {FILTERS.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`whitespace-nowrap px-4 py-2 rounded-full font-label-pill text-label-pill transition-all duration-150 ${filter === f ? 'bg-on-surface text-on-primary' : 'bg-surface-container-low hover:bg-surface-container text-on-surface'}`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-2">
              <span className="font-label-code text-label-code text-on-surface-variant">SORT BY:</span>
              <button onClick={() => setSort(sort === 'Curator Picks' ? 'A–Z' : 'Curator Picks')} className="flex items-center gap-1 font-label-pill text-label-pill text-on-surface bg-surface-container-lowest px-3 py-1.5 rounded-full shadow-sm">
                <span>{sort}</span><Icon name="expand_more" className="text-[14px]" />
              </button>
            </div>
          </div>
        </section>

        <section className="w-full px-margin-mobile md:px-margin pb-space-3xl">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-space-lg">
            {cards.map(c => (
              <article key={c.title} className="group flex flex-col rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className="relative w-full aspect-[16/10] overflow-hidden bg-surface-variant">
                  <img alt={c.alt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" src={c.img} />
                  <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/60 via-transparent to-transparent opacity-60" />
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 pointer-events-none">
                    <span className={`px-2.5 py-1 rounded-full font-label-code text-label-code font-bold uppercase tracking-wider backdrop-blur-md ${c.badgeCls}`}>{c.badge}</span>
                    <span className="px-2.5 py-1 rounded-full bg-surface-container-lowest/90 text-on-surface font-label-timecode text-label-timecode backdrop-blur-md">{c.spec}</span>
                  </div>
                  <Overlay kind={c.overlay} />
                </div>
                <div className="p-space-lg flex flex-col justify-between flex-grow">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-label-code text-label-code uppercase font-bold tracking-wider ${c.categoryCls}`}>{c.category}</span>
                      <span className="font-label-timecode text-label-timecode text-on-surface-variant">{c.meta}</span>
                    </div>
                    <h2 className={`font-headline-md text-headline-md text-on-surface transition-colors ${c.hover}`}>{c.title}</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant mt-2 line-clamp-2">{c.desc}</p>
                  </div>
                  <div className="pt-space-md mt-space-md flex flex-wrap gap-3 items-center justify-between bg-surface-container-lowest">
                    <div className="flex items-center gap-2"><Icon name={c.footIcon} className={`${c.footIconCls} text-[20px]`} /><span className="font-label-code text-label-code text-on-surface font-medium">{c.foot}</span></div>
                    <a href={links.studio()} className={`px-5 py-2.5 rounded-full font-headline-sm text-body-md font-semibold transition-all flex items-center gap-1.5 ${c.actionCls}`}>
                      <span>{c.action}</span><Icon name={c.actionIcon} className="text-[16px]" />
                    </a>
                  </div>
                </div>
              </article>
            ))}
            {!cards.length && <p className="font-body-md text-on-surface-variant">No assets in this category yet.</p>}
          </div>
        </section>

        <section className="w-full bg-surface-container-low py-space-2xl px-margin-mobile md:px-margin">
          <div className="max-w-7xl mx-auto rounded-xl bg-surface-container-lowest p-space-xl shadow-sm flex flex-col lg:flex-row items-center justify-between gap-space-lg">
            <div className="flex items-start gap-space-md max-w-xl">
              <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center flex-shrink-0"><Icon name="movie_edit" className="text-primary text-[28px]" /></div>
              <div className="flex flex-col">
                <span className="font-label-code text-label-code text-primary uppercase font-bold">Native Studio Integration</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface mt-1">Want to build your own custom preset pipeline?</h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">Export caption files, portable project files, and multi-aspect masters directly from your active sequence.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto justify-end">
              <a href="#features" className="px-6 py-3 rounded-full bg-surface-container hover:bg-surface-variant text-on-surface font-headline-sm text-body-md font-semibold transition-all">Browse Features</a>
              <a href={links.studio()} className="px-6 py-3 rounded-full bg-primary-container text-on-primary-container font-headline-sm text-body-md font-semibold hover:bg-primary shadow-cta transition-all">Open Studio Console</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
