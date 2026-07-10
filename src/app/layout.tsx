import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AEGIS VAULT — Zero-Knowledge Encrypted Notes",
  description:
    "A zero-knowledge, end-to-end encrypted notes vault. Your master key is derived in your browser and never transmitted. Argon2id + AES-256-GCM envelope encryption.",
  keywords: [
    "AEGIS VAULT",
    "encrypted notes",
    "zero-knowledge",
    "end-to-end encryption",
    "Argon2id",
    "AES-256-GCM",
    "privacy",
    "secure notepad",
  ],
  authors: [{ name: "AEGIS VAULT" }],
  robots: { index: false, follow: false },
  icons: {
    icon: "/aegis-logo.png",
    apple: "/aegis-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Sonner position="top-center" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
