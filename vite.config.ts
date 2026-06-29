/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base must match the GitHub Pages repo path: https://<user>.github.io/dndcombatmodel/
export default defineConfig({
  plugins: [react()],
  base: '/dndcombatmodel/',
  test: {
    globals: true,
    environment: 'node',
  },
});
