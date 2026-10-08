import { defineConfig } from 'vite';
import { compressPreviewWasm } from './scripts/vite-wasm-compression.mjs';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [compressPreviewWasm()],
  worker: { format: 'es' },
  // Prebundle on the dev server so the first lazy Playground visit does not
  // trigger Vite's dependency-discovery page reload. Clients still load lazily.
  optimizeDeps: { include: ['three/addons/environments/RoomEnvironment.js', 'three/addons/geometries/RoundedBoxGeometry.js', 'qrcode-generator', '@mujoco/mujoco', 'onnxruntime-web/wasm'] },
});
