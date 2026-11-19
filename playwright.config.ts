import { defineConfig, devices } from "@playwright/test";

// Tests run against the production build (vite preview): no HMR reloads mid-test, and it is what ships.
const PORT = 4199;

// FPS is only meaningful with a real GPU. Locally on Windows use headless Edge with GPU (PW_GPU=0 to disable);
// elsewhere (CI) the bundled Chromium falls back to software rendering and tests apply a lower floor
// (see tests/e2e/helpers.ts fpsFloor()).
const useGpu = process.env.PW_GPU !== "0" && process.platform === "win32" && !process.env.CI;
const gpu = useGpu
  ? { channel: "msedge", launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] } }
  : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, ...gpu }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], ...gpu }, testMatch: /mobile\.spec\.ts/ },
  ],
});
