import React, { useEffect, useState } from 'react';
import { Avatar, Icon, LogoMark, StartLink } from '../components/chrome.jsx';
import { links } from '../router.js';

const FAN = [
  { src: '/assets/art-vinyl.jpg', alt: 'Japanese vinyl koi poster', cls: 'card-1 w-[18%] max-w-[170px] sm:max-w-[210px] shadow-card-tilt' },
  { src: '/assets/art-clouds.jpg', alt: 'Cyclists on rolling green hills', cls: 'card-2 w-[18%] max-w-[170px] sm:max-w-[210px] shadow-card-tilt' },
  { src: '/assets/art-layers.jpg', alt: 'Abstract retro warm waves', cls: 'card-3 w-[20%] max-w-[190px] sm:max-w-[235px] shadow-card-center' },
  { src: '/assets/art-sunset.jpg', alt: 'Sunset over a deep sea horizon', cls: 'card-4 w-[18%] max-w-[170px] sm:max-w-[210px] shadow-card-tilt' },
  { src: '/assets/art-fish.jpg', alt: 'Deep blue school of fish', cls: 'card-5 w-[18%] max-w-[170px] sm:max-w-[210px] shadow-card-tilt' }
];

export default function Landing({ anchor }) {
  const [view, setView] = useState('director');

  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
  }, [anchor]);

  return (
    <div className="bg-white text-neutral-900 font-inter antialiased">
      <header className="w-full bg-white/90 backdrop-blur-md sticky top-0 z-50 border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <a className="flex items-center space-x-2.5 group" href={links.home}>
            <LogoMark className="w-8 h-8 shadow-sm transition-transform group-hover:scale-105" />
            <span className="font-bold text-xl tracking-tight text-neutral-950">Voxcut</span>
          </a>
          <nav className="hidden md:flex items-center space-x-9 text-[14px] font-medium text-neutral-600" aria-label="Main">
            <a className="hover:text-neutral-950 transition-colors" href="#features">Features</a>
            <a className="hover:text-neutral-950 transition-colors" href="#showcase">Showcase</a>
            <a className="hover:text-neutral-950 transition-colors" href={links.templates}>Templates</a>
            <a className="hover:text-neutral-950 transition-colors" href={links.exportPage()}>Pricing</a>
          </nav>
          <div className="flex items-center space-x-4">
            <StartLink className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white bg-brand-red rounded-full hover:bg-brand-darkRed shadow-sm hover:shadow-glow-red transition-all duration-200" />
            <span className="rounded-full ring-2 ring-neutral-200 hover:ring-neutral-400 transition"><Avatar /></span>
          </div>
        </div>
      </header>

      <section className="pt-16 pb-20 overflow-hidden text-center relative" id="showcase">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-mono font-medium tracking-wide bg-neutral-100 text-neutral-600 mb-8 border border-neutral-200/60">
            Voxcut 2.4 <span className="mx-2 text-neutral-300">/</span> Transcript-Driven Video Studio
          </div>
          <h1 className="font-serif-headline text-5xl sm:text-6xl md:text-7xl lg:text-[76px] leading-[1.08] font-normal text-neutral-950 max-w-4xl mx-auto">
            Your words. <span className="italic font-normal text-brand-red">Your cuts.</span> Your story.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-neutral-500 max-w-2xl mx-auto font-normal leading-relaxed">
            Transform spoken ideas into cinema-grade edits. Text-synced timeline, intelligent framing, and instant multi-track flow.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a className="inline-flex items-center px-7 py-3 rounded-full text-sm font-semibold text-white bg-brand-red hover:bg-brand-darkRed shadow-glow-red hover:shadow-lg transition-all transform hover:-translate-y-0.5" href={links.studio()}>
              Start Creating Free
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <a href="#features" className="inline-flex items-center px-6 py-3 rounded-full text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200/80 transition-colors border border-neutral-200/70">
              <svg className="w-4 h-4 mr-2 text-neutral-600 fill-current" viewBox="0 0 20 20"><polygon points="6 4 16 10 6 16" /></svg>
              See How It Works
            </a>
          </div>
          <div className="mt-16 sm:mt-20 max-w-6xl mx-auto relative px-2">
            <div className="flex items-end justify-center gap-2 sm:gap-3.5 md:gap-5 pb-10">
              {FAN.map(card => (
                <div key={card.src} className={`fan-card ${card.cls} aspect-[9/15] rounded-xl sm:rounded-2xl overflow-hidden border border-black/5 bg-white shrink-0`}>
                  <img alt={card.alt} className="w-full h-full object-cover" src={card.src} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white" id="features">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <span className="text-[11px] font-mono tracking-widest uppercase font-bold text-brand-red">Studio Engine</span>
            <h2 className="font-serif-headline text-4xl sm:text-5xl font-normal text-neutral-950 mt-2">Built for precision. Tuned for<br className="hidden sm:inline" /> speed.</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            <div className="lg:col-span-7 bg-[#F7F8F9] rounded-2xl p-7 border border-neutral-200/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="inline-block px-2.5 py-1 text-[11px] font-mono font-medium bg-[#FFEAE6] text-brand-red rounded">Text-To-Cut</span>
                  <span className="text-[11px] font-mono text-neutral-400 tracking-wide uppercase">Live Engine</span>
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 tracking-tight mb-6">Strike words. Video trims instantly.</h3>
                <div className="bg-white rounded-xl p-5 border border-neutral-200/60 shadow-sm space-y-3 font-mono">
                  <div className="flex items-center justify-between text-xs pb-1">
                    <div className="flex items-center space-x-2 text-neutral-600 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-brand-red" /><span>Track 01_Audio.wav</span></div>
                    <span className="text-brand-red font-semibold text-[11px]">3 Words Cut (-2.1s)</span>
                  </div>
                  <p className="font-inter text-sm text-neutral-700 leading-relaxed pt-1">
                    “Capture the sheer scale of the landscape. <span className="bg-red-100 text-brand-red line-through px-1.5 py-0.5 rounded font-medium">Um, like basically,</span> morning sun crests over the ridge.”
                  </p>
                </div>
              </div>
              <div className="mt-8 flex items-center space-x-3 pt-3">
                <Icon name="movie" className="text-[16px] text-neutral-400" />
                <div className="h-3 flex-1 bg-neutral-200 rounded-full overflow-hidden flex">
                  <div className="w-1/3 bg-blue-600 h-full" /><div className="w-1/12 bg-brand-red h-full" /><div className="w-1/4 bg-blue-600 h-full" /><div className="flex-1 bg-neutral-300 h-full" />
                </div>
                <span className="font-mono text-[11px] text-neutral-500 font-medium">00:14.28</span>
              </div>
            </div>
            <div className="lg:col-span-5 bg-[#F7F8F9] rounded-2xl p-7 border border-neutral-200/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="inline-block px-2.5 py-1 text-[11px] font-mono font-medium bg-[#E8F0FE] text-blue-600 rounded">Smart Horizon</span>
                  <Icon name="open_in_full" className="text-[16px] text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 tracking-tight mb-6">One master file. Every aspect.</h3>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[['person', '9:16 Reels', 'bg-[#DFE7F2]'], ['grid_3x3', '16:9 Cinema', 'bg-[#E4ECF6]'], ['crop_square', '1:1 Feed', 'bg-[#EAEFF5]']].map(([icon, label, bg]) => (
                    <div key={label} className={`${bg} rounded-lg p-3 text-center flex flex-col items-center justify-center h-28 border border-blue-100`}>
                      <Icon name={icon} className="text-[24px] text-blue-700 mb-1" />
                      <span className="text-[10px] font-mono font-medium text-neutral-600 mt-2">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 text-center"><span className="font-mono text-[11px] text-blue-600 font-medium">Crop or Pad — Never Stretched</span></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#F7F8F9] rounded-2xl p-6 border border-neutral-200/70">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3"><Icon name="subtitles" className="text-[16px]" /></div>
              <h4 className="font-semibold text-neutral-900 text-base mb-4">Timed Captions</h4>
              <div className="flex flex-wrap gap-1.5 font-mono text-[10px] font-bold">
                <span className="bg-[#E97652] text-white px-2.5 py-1 rounded">SRT</span>
                <span className="bg-[#2D9B87] text-white px-2.5 py-1 rounded">VTT</span>
                <span className="bg-[#E45E48] text-white px-2.5 py-1 rounded">BURN-IN</span>
                <span className="bg-[#2B4B5B] text-white px-2.5 py-1 rounded">STYLES</span>
              </div>
            </div>
            <div className="bg-[#F7F8F9] rounded-2xl p-6 border border-neutral-200/70">
              <div className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-3"><Icon name="graphic_eq" className="text-[16px]" /></div>
              <h4 className="font-semibold text-neutral-900 text-base mb-3">Filler &amp; Silence Review</h4>
              <div className="h-9 bg-white rounded-lg border border-neutral-200/70 flex items-center justify-center px-4">
                <svg className="w-full h-5 text-brand-red stroke-current fill-none stroke-[1.5]" preserveAspectRatio="none" viewBox="0 0 160 20"><path d="M0,10 Q10,0 20,10 T40,10 T50,2 T60,18 T70,5 T80,15 T90,2 T100,18 T110,6 T120,14 T130,10 T140,10 T160,10" /></svg>
              </div>
            </div>
            <div className="bg-[#F7F8F9] rounded-2xl p-6 border border-neutral-200/70 flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3"><Icon name="cloud_done" className="text-[16px]" /></div>
                <h4 className="font-semibold text-neutral-900 text-base mb-2">Private Render Server</h4>
              </div>
              <div className="flex items-center justify-between text-xs font-mono bg-white p-2.5 rounded-lg border border-neutral-200/70">
                <span className="text-neutral-500 font-medium">4K Master</span><span className="text-emerald-600 font-bold tracking-wider">Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-4 border-b border-neutral-100 gap-4">
            <div>
              <span className="text-[11px] font-mono tracking-widest uppercase font-bold text-brand-red">Live Studio Mockup</span>
              <h2 className="font-serif-headline text-3xl sm:text-4xl text-neutral-950 mt-1">Designed like an instrument.</h2>
            </div>
            <div className="inline-flex p-1 bg-neutral-100 rounded-full border border-neutral-200/70 text-xs font-medium self-start sm:self-auto" role="tablist">
              <button role="tab" aria-selected={view === 'standard'} onClick={() => setView('standard')} className={view === 'standard' ? 'px-3.5 py-1.5 rounded-full bg-brand-red text-white shadow-sm font-semibold' : 'px-3.5 py-1.5 rounded-full text-neutral-600 hover:text-neutral-900 transition'}>Standard View</button>
              <button role="tab" aria-selected={view === 'director'} onClick={() => setView('director')} className={view === 'director' ? 'px-3.5 py-1.5 rounded-full bg-brand-red text-white shadow-sm font-semibold' : 'px-3.5 py-1.5 rounded-full text-neutral-600 hover:text-neutral-900 transition'}>Director Timeline</button>
            </div>
          </div>
          <MockTimeline compact={view === 'standard'} />
        </div>
      </section>

      <section className="py-16 md:py-20" id="cta">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FFE7E0] via-[#F4F4FD] to-[#E9EEFC] border border-red-100/60 p-12 sm:p-20 text-center shadow-sm">
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-red-300/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-blue-300/30 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 className="font-serif-headline text-4xl sm:text-5xl md:text-6xl text-neutral-950 font-normal leading-[1.12]">Turn your raw ideas into master edits.</h2>
              <div className="mt-8 flex justify-center">
                <a className="inline-flex items-center px-8 py-3.5 rounded-full text-sm font-semibold text-white bg-brand-red hover:bg-brand-darkRed shadow-glow-red hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5" href={links.studio()}>Start Creating Free</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="w-full bg-white border-t border-neutral-100 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between pb-8 border-b border-neutral-100 gap-4">
            <div className="flex items-center space-x-2.5">
              <LogoMark className="w-6 h-6 rounded" />
              <span className="font-bold text-lg tracking-tight text-neutral-900">Voxcut</span>
              <span className="text-[11px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">v2.4</span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-neutral-600">
              <a className="hover:text-neutral-950 transition" href="#features">Features</a>
              <a className="hover:text-neutral-950 transition" href="#showcase">Showcase</a>
              <a className="hover:text-neutral-950 transition" href={links.templates}>Templates</a>
              <a className="hover:text-neutral-950 transition" href={links.exportPage()}>Pricing</a>
              <a className="text-brand-red font-semibold hover:underline" href={links.studio()}>Launch Studio</a>
            </nav>
          </div>
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-neutral-400 font-mono gap-3">
            <p>© 2026 Voxcut. Edit the text. Rewrite the video.</p>
            <div className="flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-neutral-600 font-medium">Local Render Node Active</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MockTimeline({ compact }) {
  return (
    <div className="bg-[#F6F7F9] rounded-2xl border border-neutral-300/80 p-5 shadow-sm font-mono text-[11px] overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200 mb-5">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-[#FF5F56] inline-block" /><span className="w-3 h-3 rounded-full bg-[#FFBD2E] inline-block" /><span className="w-3 h-3 rounded-full bg-[#27C93F] inline-block" />
            <span className="text-neutral-600 ml-3 text-xs font-semibold">Project: Voxcut_Sequence_Master.cut</span>
          </div>
          <div className="flex items-center space-x-3 text-xs"><span className="text-neutral-800 font-semibold tracking-wider">00:01:24:18</span><span className="text-emerald-600 font-semibold">23.976 fps</span></div>
        </div>
        <div className="grid grid-cols-6 text-neutral-400 pb-2 text-[10px] pl-16">{['00:00', '00:15', '00:30', '00:45', '01:00', '01:15'].map(t => <span key={t}>{t}</span>)}</div>
        <div className="space-y-2.5">
          {!compact && (
            <div className="flex items-center">
              <span className="w-16 font-bold text-neutral-500 uppercase text-[10px]">TXT 01</span>
              <div className="flex-1 flex gap-2 overflow-hidden">
                {[['"Neon reflections in rain"', 'w-1/4'], ['"The city awakens at midnight"', 'w-1/3'], ['"Turn up the atmospheric score"', 'w-1/3']].map(([t, w]) => <div key={t} className={`bg-[#FCD8CD] text-[#842A16] px-3 py-1.5 rounded text-[10px] font-inter truncate ${w}`}>{t}</div>)}
              </div>
            </div>
          )}
          <div className="flex items-center">
            <span className="w-16 font-bold text-neutral-500 uppercase text-[10px]">VID 01</span>
            <div className="flex-1 flex gap-1.5 overflow-hidden">
              <div className="bg-[#2563EB] text-white px-3 py-2 rounded flex justify-between items-center w-3/12 font-medium"><span className="truncate">Shot_01_Establish.mov</span><span className="text-[9px] opacity-80">4K</span></div>
              <div className="bg-[#1D4ED8] text-white px-3 py-2 rounded flex justify-between items-center w-5/12 font-medium"><span className="truncate">Shot_02_Cyberpunk_Alley.mov</span><span className="text-[9px] opacity-80">4K HDR</span></div>
              <div className="bg-[#2563EB] text-white px-3 py-2 rounded flex justify-between items-center w-4/12 font-medium"><span className="truncate">Shot_03_DollyOut.mov</span><span className="text-[9px] opacity-80">4K</span></div>
            </div>
          </div>
          <div className="flex items-center">
            <span className="w-16 font-bold text-neutral-500 uppercase text-[10px]">AUD 01</span>
            <div className="flex-1 bg-[#A8E634] text-[#1E3B00] px-4 py-2 rounded flex justify-between items-center font-medium"><span>Voiceover_Narration_Master.wav</span><span className="text-[9px] bg-black/10 px-2 py-0.5 rounded">Ducked -6dB</span></div>
          </div>
          {!compact && (
            <div className="flex items-center">
              <span className="w-16 font-bold text-neutral-500 uppercase text-[10px]">SFX 02</span>
              <div className="flex-1 flex gap-2">
                <div className="w-1/2 bg-[#E1E0EA] text-neutral-700 px-3 py-1.5 rounded text-[10px] truncate">Synthesizer_Rumble_Pad.aiff</div>
                <div className="w-1/3 bg-[#E1E0EA] text-neutral-700 px-3 py-1.5 rounded text-[10px] truncate">Rain_Thunder_Stereo.wav</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
