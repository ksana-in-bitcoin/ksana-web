/**
 * Build fingerprint (UI/UX review §2.7): the git commit hash that vite.config.ts injects at build time via define (short form,
 * 9 characters; empty string when unavailable).
 * The footer and "Settings -> About" show it and link to that commit in the repository; the README section on verifying this page
 * explains how to check it.
 */
declare const __KSANA_COMMIT__: string;
