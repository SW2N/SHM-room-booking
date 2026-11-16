import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Published at https://sw2n.github.io/SHM-room-booking/
export default defineConfig({
  base: '/SHM-room-booking/',
  plugins: [react()],
})
