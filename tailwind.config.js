/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1e1e1e',
          1: '#252526',
          2: '#2d2d30',
          3: '#3c3c3c',
          4: '#4a4a4a',
        },
        border: {
          DEFAULT: '#3c3c3c',
          subtle: '#2d2d30',
        },
        accent: {
          DEFAULT: '#0e639c',
          hover: '#1177bb',
          light: '#4fc1ff',
        },
        success: '#4ec9b0',
        warning: '#dcdcaa',
        error: '#f44747',
        muted: '#6a6a6a',
        text: {
          DEFAULT: '#cccccc',
          dim: '#969696',
          bright: '#ffffff',
        },
        node: {
          source: '#1e3a5f',
          filter: '#3a2b1e',
          join: '#1e3a2b',
          aggregate: '#2b1e3a',
          select: '#1e2b3a',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
