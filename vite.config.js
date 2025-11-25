import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 关键：相对路径，防止手机上白屏
  build: {
    outDir: 'dist', // 产物输出到 dist 文件夹
    emptyOutDir: true
  }
})