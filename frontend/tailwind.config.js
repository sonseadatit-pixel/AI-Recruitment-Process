/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens from the Figma export (kept intact)
        navy: {
          DEFAULT: '#1E3A5F',
          light: '#2A4F7C',
          dark: '#162D4A',
          50: '#f0f4f8',
          100: '#d9e2ec',
          600: '#20406b',
          700: '#1a3354',
          800: '#14263f',
          900: '#0f1d31',
        },
        teal: {
          DEFAULT: '#0D9488',
          light: '#14B8A6',
        },
        sidebar: '#111827',
      },
    },
  },
  plugins: [],
};
