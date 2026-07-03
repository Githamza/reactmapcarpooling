import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // deno.json serves this directory on Deno Deploy — keep the CRA name
    outDir: "build",
  },
});
