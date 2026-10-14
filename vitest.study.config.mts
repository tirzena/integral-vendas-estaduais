import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({resolve: {alias: {"@": fileURLToPath(new URL("./src", import.meta.url))}}, test: {include: ["tests/study-guide.test.ts", "tests/study-guide-render.test.ts", "src/lib/estadual-routes.test.ts"]}});
