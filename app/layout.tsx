import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "elevator.help — AI assistant for elevator technicians",
  description: "Manuals, fault codes and troubleshooting for elevator technicians."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        <div className="siteAdSlot" aria-label="Advertisement placeholder">
          Your advertisement here
        </div>

        <style>{`
          .sources,
          .disclosure {
            display: none !important;
          }

          .siteAdSlot {
            width: min(760px, calc(100% - 32px));
            margin: 18px auto 24px;
            padding: 9px 14px;
            border: 1px dashed #d9dfdb;
            border-radius: 10px;
            color: #9aa29d;
            background: #fafbfa;
            text-align: center;
            font-size: 11px;
            line-height: 1.4;
          }
        `}</style>
      </body>
    </html>
  );
}
