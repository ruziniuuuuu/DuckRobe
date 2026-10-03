import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  worker: { format: 'es' },
  // Prebundle on the dev server so the first lazy Playground visit does not
  // trigger Vite's dependency-discovery page reload. Clients still load lazily.
  optimizeDeps: { include: ['three/addons/environments/RoomEnvironment.js', '@mujoco/mujoco', 'onnxruntime-web/wasm'] },
});
