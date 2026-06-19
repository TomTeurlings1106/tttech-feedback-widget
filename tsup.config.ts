import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  treeshake: true,
  onSuccess: async () => {
    const dist = "dist";
    for (const file of ["index.js", "index.cjs"]) {
      const path = join(dist, file);
      const content = readFileSync(path, "utf8");
      if (!content.startsWith('"use client"')) {
        writeFileSync(path, `"use client";\n${content}`);
      }
    }
    console.log('✓ "use client" directive prepended to both bundles');
  },
});
