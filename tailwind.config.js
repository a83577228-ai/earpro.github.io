/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 安全区域支持
      padding: {
        'safe': 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
      margin: {
        'safe': 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
      // 自定义动画
      animation: {
        'in': 'in 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in-from-right-4': 'slideInFromRight4 0.3s ease-out',
      },
      keyframes: {
        in: {
          '0%': { opacity: 0, transform: 'scale(0.9)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        slideInFromRight4: {
          '0%': { opacity: 0, transform: 'translateX(1rem)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
      },
      // 自定义阴影
      boxShadow: {
        'inner-lg': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
}