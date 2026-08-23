import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "elevator.help — AI assistant for elevator technicians",
  description: "Manuals, fault codes and troubleshooting for elevator technicians."
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}