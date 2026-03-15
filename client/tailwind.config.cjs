/** @type {import('tailwindcss').Config} */

/*
 * Golden Ratio (φ = 1.618) Design System
 * ──────────────────────────────────────
 * Spacing scale:  4 → 6.5 → 10.5 → 17 → 27 → 44 → 71 → 115
 * Font scale:     12 → 14 → 16 → 19.4 → 25.9 → 31.4 → 41.9 → 50.8
 */

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        aurora: { 50: '#fcfdfc', DEFAULT: '#f7fbfa' },
        aalgold: { DEFAULT: '#d4af37', light: '#e8cd6b', dark: '#b8961e' },
        aalgreen: { DEFAULT: '#00b96b', light: '#33d48d', dark: '#008f53' },
        aalred: { DEFAULT: '#ff3b30', light: '#ff6961', dark: '#cc2f26' },
        aalmuted: '#6b7280',
      },
      /* Golden-ratio derived spacing */
      spacing: {
        'phi-1': '0.25rem',
        'phi-2': '0.406rem',
        'phi-3': '0.656rem',
        'phi-4': '1.063rem',
        'phi-5': '1.688rem',
        'phi-6': '2.75rem',
        'phi-7': '4.438rem',
        'phi-8': '7.188rem',
      },
      /* Golden-ratio typography scale */
      fontSize: {
        'phi-xs':  ['0.75rem',  { lineHeight: '1.1rem' }],
        'phi-sm':  ['0.875rem', { lineHeight: '1.3rem' }],
        'phi-base':['1rem',     { lineHeight: '1.618rem' }],
        'phi-lg':  ['1.214rem', { lineHeight: '1.964rem' }],
        'phi-xl':  ['1.618rem', { lineHeight: '2.2rem' }],
        'phi-2xl': ['1.963rem', { lineHeight: '2.618rem' }],
        'phi-3xl': ['2.618rem', { lineHeight: '3.236rem' }],
        'phi-4xl': ['3.176rem', { lineHeight: '3.8rem' }],
      },
      /* Golden split widths for layout */
      width: {
        'golden-major': '61.8%',
        'golden-minor': '38.2%',
      },
      maxWidth: {
        'golden-major': '61.8%',
        'golden-minor': '38.2%',
      },
      /* Animations */
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212, 175, 55, 0.4)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(212, 175, 55, 0)' },
        },
      },
      animation: {
        'fade-in':        'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'pulse-gold':     'pulse-gold 2s infinite',
      },
      aspectRatio: {
        golden: '1.618 / 1',
      },
      borderRadius: {
        'phi': '0.618rem',
        'phi-lg': '1rem',
        'phi-xl': '1.618rem',
      },
    },
  },
  plugins: [],
};
