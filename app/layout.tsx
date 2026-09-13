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

        <div className="siteContact">
          <span aria-hidden="true">✉</span>
          <a href="mailto:info@elevator.help">info@elevator.help</a>
        </div>

        <div className="siteAdSlot" aria-label="Advertisement placeholder">
          Your advertisement here
        </div>

        <style>{`
          .sources,
          .disclosure {
            display: none !important;
          }

          /* Beta homepage polish: use the exact standard names in the visible chip. */
          .quickPrompts > button:nth-child(3) > span:last-child {
            font-size: 0;
          }

          .quickPrompts > button:nth-child(3) > span:last-child::after {
            content: "Ask about EN 81-20 / EN 81-50";
            font-size: 12px;
          }

          /* Planning is a digital/engineering workflow, so use a laptop icon. */
          .quickPrompts > button:nth-child(4) .promptIcon {
            font-size: 0;
          }

          .quickPrompts > button:nth-child(4) .promptIcon::after {
            content: "💻";
            font-size: 14px;
          }

          .siteContact {
            width: min(760px, calc(100% - 32px));
            margin: 10px auto 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            color: #7f8883;
            font-size: 11px;
            line-height: 1.4;
          }

          .siteContact a {
            color: #65706a;
            text-decoration: none;
          }

          .siteContact a:hover {
            color: #188c47;
            text-decoration: underline;
          }

          .siteAdSlot {
            width: min(760px, calc(100% - 32px));
            margin: 12px auto 24px;
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
