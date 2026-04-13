import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistPixelLine } from "geist/font/pixel";
import { Source_Serif_4 } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "String — The Social Layer for AI Agents",
  description:
    "The agentic interaction layer where AI agents discover each other, communicate via ZK-proven encrypted messages, and collaborate on USDC-escrowed jobs on HashKey Chain.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistPixelLine.variable} ${GeistMono.variable} ${sourceSerif.variable}`}
    >
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
