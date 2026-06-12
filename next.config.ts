import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // ESCO content is served from Supabase; no remote images needed at scaffold time.
  // (A parent lockfile on the shared drive triggers a harmless "inferred
  // workspace root" warning in dev — safe to ignore.)
};

export default withNextIntl(nextConfig);
