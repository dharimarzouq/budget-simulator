import { defineConfig } from "vite";
import yaml from "@rollup/plugin-yaml";

export default defineConfig({
  plugins: [yaml()],
  base: "./",
  server: {
    // Don't watch the Python environments or the data build: tens of thousands of files that made
    // starting Vite take over a minute.
    watch: { ignored: ["**/.venv/**", "**/.venv-pe/**", "**/data/**", "**/dist/**"] },
  },
  optimizeDeps: { entries: ["index.html"] },
});
