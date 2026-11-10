import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"], globalSetup: ["test/global-setup.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 120000,
    env: { NODE_ENV: "test", DATABASE_URL: "postgresql://jafson:jafson@localhost:5432/jafson_test", JWT_SECRET: "test-secret-test-secret-test-secret", ADMIN_API_KEY: "test-admin", BILL_OS_API_KEY: "test-billos", PAYMENT_WEBHOOK_SECRET: "test-webhook", PAYMENTS_MOCK: "1", OTP_DEV_ECHO: "1" },
  },
});
