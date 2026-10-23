// Design tokens from the "Cinema Editorial Minimalist" system (page2/DESIGN.md)
// plus the landing page's brand palette (page1).

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { red: '#e03616', darkRed: '#c5280b', surface: '#F8F9FA', border: '#ECEEF1', subtle: '#6B7280' },
        'on-secondary-container': '#fefcff', 'on-secondary': '#ffffff', 'on-primary-fixed-variant': '#8d1500',
        'surface-container-lowest': '#ffffff', background: '#f9f9ff', 'on-secondary-fixed-variant': '#003ea8',
        secondary: '#0051d5', 'on-tertiary-fixed': '#102000', 'surface-tint': '#b91e00', 'on-error-container': '#93000a',
        'surface-variant': '#dce2f7', 'surface-container-highest': '#dce2f7', 'primary-fixed-dim': '#ffb4a5',
        tertiary: '#3f6700', outline: '#906f68', 'primary-container': '#dc3313', 'surface-container-high': '#e1e8fd',
        'surface-dim': '#d3daef', 'outline-variant': '#e5beb5', primary: '#b41d00', 'secondary-container': '#316bf3',
        'on-primary': '#ffffff', 'on-background': '#141b2b', 'inverse-surface': '#293040', 'surface-bright': '#f9f9ff',
        'surface-container': '#e9edff', 'inverse-primary': '#ffb4a5', 'on-primary-container': '#fffbff',
        'tertiary-container': '#518200', 'error-container': '#ffdad6', 'surface-container-low': '#f1f3ff',
        'on-secondary-fixed': '#00174b', error: '#ba1a1a', 'on-error': '#ffffff', 'on-tertiary': '#ffffff',
        'on-surface': '#141b2b', 'inverse-on-surface': '#edf0ff', 'tertiary-fixed': '#acf847', 'secondary-fixed': '#dbe1ff',
        'tertiary-fixed-dim': '#91db2a', 'on-primary-fixed': '#3e0500', 'on-tertiary-fixed-variant': '#304f00',
        'on-surface-variant': '#5c403a', 'secondary-fixed-dim': '#b4c5ff', 'primary-fixed': '#ffdad3', surface: '#f9f9ff',
        'on-tertiary-container': '#f9ffea'
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        'headline-lg': ['Newsreader', 'Georgia', 'serif'],
        'headline-md': ['Newsreader', 'Georgia', 'serif'],
        'display-hero': ['Newsreader', 'Georgia', 'serif'],
        'headline-sm': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'body-lg': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'body-md': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'body-sm': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'label-pill': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'label-code': ['"Space Grotesk"', 'ui-monospace', 'monospace'],
        'label-timecode': ['"Space Grotesk"', 'ui-monospace', 'monospace']
      },
      fontSize: {
        'display-hero': ['64px', { lineHeight: '72px', letterSpacing: '-0.02em', fontWeight: '400' }],
        'display-hero-mobile': ['40px', { lineHeight: '48px', letterSpacing: '-0.015em', fontWeight: '400' }],
        'headline-lg': ['36px', { lineHeight: '44px', letterSpacing: '-0.01em', fontWeight: '400' }],
        'headline-lg-mobile': ['28px', { lineHeight: '36px', letterSpacing: '-0.01em', fontWeight: '400' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '500' }],
        'headline-sm': ['18px', { lineHeight: '26px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '26px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '22px', fontWeight: '400' }],
        'body-sm': ['12px', { lineHeight: '18px', fontWeight: '400' }],
        'label-code': ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '600' }],
        'label-timecode': ['12px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '500' }],
        'label-pill': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '600' }]
      },
      spacing: {
        margin: '3rem', 'margin-mobile': '1.25rem', gutter: '1.5rem', 'gutter-sm': '1rem',
        'space-2xs': '0.125rem', 'space-xs': '0.25rem', 'space-sm': '0.5rem', 'space-md': '1rem',
        'space-lg': '1.5rem', 'space-xl': '2.5rem', 'space-2xl': '4rem', 'space-3xl': '6rem'
      },
      boxShadow: {
        'card-tilt': '0 20px 35px -10px rgba(0, 0, 0, 0.12), 0 8px 16px -6px rgba(0, 0, 0, 0.08)',
        'card-center': '0 25px 45px -12px rgba(0, 0, 0, 0.2), 0 12px 24px -8px rgba(0, 0, 0, 0.12)',
        'glow-red': '0 10px 25px -4px rgba(224, 54, 22, 0.4)',
        cta: '0 10px 25px -4px rgba(224, 54, 22, 0.3)',
        'cta-blue': '0 10px 25px -4px rgba(0, 81, 213, 0.3)',
        'cta-green': '0 10px 25px -4px rgba(63, 103, 0, 0.3)'
      }
    }
  },
  plugins: []
};
