import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1A1A18',
          text: '#FFFFFF',
        },
        surface: {
          page:   '#F5F4F0',
          subtle: '#F0EEE9',
          card:   '#FFFFFF',
          input:  '#F7F6F3',
        },
        border: {
          DEFAULT: '#E8E6E0',
          strong:  '#C8C6C0',
        },
        text: {
          primary:   '#1A1A18',
          secondary: '#6B6A65',
          muted:     '#A8A7A2',
          faint:     '#C8C6C0',
        },
      },
    },
  },
  plugins: [],
}

export default config
