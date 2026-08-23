import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "elevator.help — AI assistant for elevator technicians",
  description:
    "A practical AI workspace for elevator technicians: manuals, fault codes and troubleshooting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
