import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "tests/order-change-request-identity.test.tsx",
      "src/lib/catalog-views.test.ts",
      "tests/order-editor-cache.test.tsx",
      "tests/order-approval-close.test.tsx",
      "src/lib/order-exchange.test.ts",
      "src/lib/order-product-scope.test.ts",
    ],
  },
});
