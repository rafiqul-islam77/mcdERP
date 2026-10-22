import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ERP Sidebar (dark navy)
        sidebar: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          active: '#1d4ed8',
          border: '#1e3a5f',
          text: '#cbd5e1',
          'text-muted': '#64748b',
        },
        // ERP Accent
        brand: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#dbeafe',
        },
        // Status colors
        success: {
          DEFAULT: '#22c55e',
          light: '#dcfce7',
          dark: '#15803d',
        },
        danger: {
          DEFAULT: '#ef4444',
          light: '#fee2e2',
          dark: '#b91c1c',
        },
        warning: {
          DEFAULT: '#f59e0b',
          light: '#fef3c7',
          dark: '#b45309',
        },
        // Content area
        surface: {
          DEFAULT: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
          muted: '#f1f5f9',
        },
        // Text
        ink: {
          DEFAULT: '#0f172a',
          muted: '#64748b',
          light: '#94a3b8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        'erp': '8px',
        'erp-lg': '12px',
        'erp-xl': '16px',
      },
      boxShadow: {
        'erp': '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        'erp-md': '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
        'erp-lg': '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
      },
      fontSize: {
        'xxs': ['10px', '14px'],
      },
    },
  },
  plugins: [],
}

export default config
