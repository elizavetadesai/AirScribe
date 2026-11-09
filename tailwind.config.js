/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary — deep forest green
        forest: {
          50:  '#f0f5f2',
          100: '#d6e8dc',
          200: '#aed0bb',
          300: '#7db398',
          400: '#4f9270',
          500: '#2d6b4a',
          600: '#1f4f36',
          700: '#173c29',
          800: '#112d1f',
          900: '#0c2016',
        },
        // Accent — warm sand/terracotta
        sand: {
          50:  '#fdf8f3',
          100: '#f7ece0',
          200: '#eed8c0',
          300: '#e0be9a',
          400: '#cfa070',
          500: '#b8824e',
          600: '#9a6838',
          700: '#7d5029',
          800: '#5f3a1c',
          900: '#3d2510',
        },
        // Background & surface — warm cream
        cream: {
          50:  '#fefcf9',
          100: '#faf6f0',
          200: '#f4ebe0',
          300: '#ede0ce',
          400: '#e0cdb6',
          500: '#ccb597',
          600: '#b39678',
          700: '#8f7458',
          800: '#6a543d',
          900: '#453524',
        },
        // Dark text — warm charcoal/bark
        bark: {
          50:  '#f5f2ef',
          100: '#e0d8d1',
          200: '#c2b4a8',
          300: '#a08f80',
          400: '#7d6b5c',
          500: '#5e4f41',
          600: '#43382c',
          700: '#302820',
          800: '#201a14',
          900: '#120e0a',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        'widest2': '0.2em',
      },
      borderRadius: {
        'sm': '4px',
        DEFAULT: '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
