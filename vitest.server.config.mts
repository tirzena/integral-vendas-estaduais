import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Server-handler regression tests must run without Start's RPC transforms.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/lib/purchase-position.functions.test.ts"] },
});
