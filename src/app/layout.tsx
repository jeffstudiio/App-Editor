import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { withBase } from "@/lib/base-path";

export const metadata: Metadata = {
  title: "استودیو خلاق | جعبه‌ابزار هنری تو",
  description:
    "همه ابزارهای خلاقیت در یک اپ: دستیار هنری هوش مصنوعی، اکسپلور ایده‌ها، زیرنویس‌ساز حرفه‌ای و استودیو طراحی استوری.",
  applicationName: "استودیو خلاق",
  manifest: withBase("/manifest.json"),
  icons: {
    icon: withBase("/icons/icon-192.png"),
    apple: withBase("/icons/icon-192.png"),
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "استودیو خلاق",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d1817",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground overscroll-none">
        {children}
        <Toaster position="top-center" richColors toastOptions={{ style: { fontFamily: "Vazirmatn, sans-serif" } }} />
      </body>
    </html>
  );
}
