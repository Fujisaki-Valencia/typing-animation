import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/typing-animation/',
  server: {
    port: 3001
  },
  plugins: [react()]
})
