import type { NextConfig } from "next";

// ─────────────────────────────────────────────────────────────
// دو حالت بیلد:
// ۱) عادی → standalone (سرور Node با API Routes)
// ۲) PHONE_BUILD=1 → خروجی استاتیک export برای میزبانی ثابت
//    (GitHub Pages زیر /App-Editor) — API Routes با اسکریپت
//    scripts/build-phone.sh موقتاً کنار می‌روند.
// ─────────────────────────────────────────────────────────────

const isPhone = process.env.PHONE_BUILD === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(isPhone
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        basePath,
        eslint: { ignoreDuringBuilds: true },
      }
    : {
        output: "standalone" as const,
      }),
  // ممیزی: گیت تایپ واقعی — src/ بدون خطاست؛ skills/ از tsconfig خارج شده است
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
