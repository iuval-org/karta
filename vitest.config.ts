import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Merge with the main vite config for consistent plugin setup
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/**/*.d.ts',
          'src/test/**',
          'src/data/**',
        ],
      },
    },
  }),
);
