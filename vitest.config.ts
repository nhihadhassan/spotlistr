import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // `server-only` throws on import outside a React Server Component, which
      // breaks any test that transitively touches the Spotify client. The
      // guard is a build-time assertion for the app, not a runtime dependency,
      // so stubbing it in tests loses nothing.
      "server-only": path.resolve(
        import.meta.dirname,
        "./src/test/server-only-stub.ts",
      ),
    },
  },
});
