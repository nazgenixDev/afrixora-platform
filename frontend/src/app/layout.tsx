import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "AFRIXORA — Global IoT Intelligence Platform",
  description: "B2B SaaS IoT platform for intelligent building management in Africa",
  icons: {
    icon: "/favicon-afrixora.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon-afrixora.png" sizes="48x48" type="image/png" />
      </head>
      <body className="font-sans bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="afrixora-theme">
          {children}
        </ThemeProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
