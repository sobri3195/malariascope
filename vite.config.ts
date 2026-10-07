import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/recharts|d3-|victory|react-smooth/.test(id)) return 'charts';
            if (/leaflet/.test(id)) return 'gis';
            if (/react|scheduler/.test(id)) return 'react-vendor';
          }
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client'))
          return;
        warn(warning);
      },
    },
  },
});
