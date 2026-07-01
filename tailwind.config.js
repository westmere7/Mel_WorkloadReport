/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // RMIT primary brand
        rmit: {
          red: '#E61E2A',
          navy: '#000054',
        },
        // Red scale (derived from #E61E2A)
        brand: {
          50: '#fdeaec',
          100: '#fbd0d4',
          200: '#f6a3aa',
          300: '#f1757f',
          400: '#ec4854',
          500: '#e61e2a',
          600: '#c01722',
          700: '#94121b',
          800: '#680c13',
          900: '#3d070b',
        },
        // Navy scale (derived from #000054)
        navy: {
          50: '#e6e6ef',
          100: '#b3b3cf',
          200: '#8080af',
          300: '#4d4d8f',
          400: '#26266f',
          500: '#000054',
          600: '#00004a',
          700: '#00003c',
          800: '#00002b',
          900: '#00001a',
        },
        // Complementary accents for charts / highlights
        accent: {
          orange: '#F58220',
          gold: '#FFB81C',
          teal: '#00A9CE',
          green: '#5BBA47',
          plum: '#8E5BA6',
        },
        // Semantic tokens — driven by CSS variables so they flip with the
        // `.dark` class (dark palette derived from RMIT navy #000054).
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        subtle: 'var(--subtle)',
        line: 'var(--line)',
        sidebar: 'var(--sidebar)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 84, 0.06), 0 8px 24px rgba(0, 0, 84, 0.05)',
        soft: '0 1px 2px rgba(16, 24, 40, 0.06)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
