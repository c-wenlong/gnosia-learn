import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { LearnerProvider } from "@/lib/learner-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Self-Learn · AY2026/27 Shortlist",
    template: "%s · Self-Learn",
  },
  description:
    "Docs-style self-study hub for the SoC AY2026/27 course shortlist, with progress, notes, and resources.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('self-learn:v1');if(!s)return;var t=JSON.parse(s).theme;if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full">
        <LearnerProvider>
          <AppShell>{children}</AppShell>
        </LearnerProvider>
      </body>
    </html>
  );
}
