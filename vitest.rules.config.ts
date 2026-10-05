import { defineConfig } from "vitest/config";

// Firestore Rules tests. Must run against the emulator: `npm run test:rules`
export default defineConfig({
  test: {
    environment: "node",
    include: ["firestore.rules.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
