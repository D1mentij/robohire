import { test as base, expect } from "@playwright/test";

/** Silent e2e: speechSynthesis is stubbed in every page (speak() is a no-op) and Chromium runs with --mute-audio (playwright.config.ts). */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      const synth = {
        speaking: false, pending: false, paused: false,
        speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
        getVoices: () => [] as SpeechSynthesisVoice[],
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
        onvoiceschanged: null,
      };
      Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    });
    await provide(page);
  },
});
export { expect };
