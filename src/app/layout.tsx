import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Running Public Search",
  description: "Search the Running Public Podcast",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
        <div className="flex flex-col items-center justify-center h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
