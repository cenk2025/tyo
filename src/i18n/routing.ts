import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for SkillPath. Finnish is the default and is served without a
 * forced prefix only when `localePrefix` allows; here we always prefix so URLs
 * are unambiguous (`/fi/...`, `/en/...`) — important for a bilingual public tool.
 */
export const routing = defineRouting({
  locales: ["fi", "en"],
  defaultLocale: "fi",
  localePrefix: "always",
  // Persist the user's choice; next-intl reads/writes the NEXT_LOCALE cookie.
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];
