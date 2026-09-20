/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        hostinger: {
          50: '#f4f0ff',
          100: '#ece3ff',
          200: '#dbc8ff',
          300: '#c39eff',
          400: '#a66aff',
          500: '#893bff',
          600: '#673de6', // Hostinger signature violet
          700: '#5631c7',
          800: '#4727a6',
          900: '#3a2084',
          950: '#231159',
        },
        panel: {
          bg: '#0c0e15',       // Clean deep enterprise canvas
          surface: '#131622',  // Card / panel container
          subtle: '#191d2c',   // Secondary surface / inputs
          border: '#232838',   // Crisp 1px divider
          muted: '#2c3246',    // Accent border
        }
      },
    },
  },
  plugins: [],
}
