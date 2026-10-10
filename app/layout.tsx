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

        <div className="betaAdGrid" aria-label="Beta information and advertising">
          <div className="betaOwnBanner">
            <strong>elevator.help</strong>
            <span>Your best companion for elevators</span>
          </div>

          <div className="siteAdSlot" aria-label="Advertisement placeholder">
            Your advertisement here
          </div>
        </div>

        <footer className="siteContact">
          <span aria-hidden="true">✉</span>
          <a href="mailto:info@elevator.help">info@elevator.help</a>
        </footer>

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

          /* Beta graphics: prompts must fit cleanly on desktop and mobile. */
          .quickPrompts {
            width: 100%;
          }

          .quickPrompts button {
            max-width: 100%;
          }

          .betaAdGrid {
            width: min(880px, calc(100% - 32px));
            margin: 18px auto 0;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .betaOwnBanner,
          .siteAdSlot {
            min-height: 58px;
            padding: 12px 16px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-size: 11px;
            line-height: 1.4;
          }

          .betaOwnBanner {
            gap: 6px;
            flex-wrap: wrap;
            border: 1px solid #dce7df;
            background: #f4faf6;
            color: #53605a;
          }

          .betaOwnBanner strong {
            color: #188c47;
            font-size: 12px;
          }

          .siteAdSlot {
            border: 1px dashed #d9dfdb;
            color: #9aa29d;
            background: #fafbfa;
          }

          .siteContact {
            width: min(880px, calc(100% - 32px));
            margin: 14px auto 24px;
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

          @media (max-width: 700px) {
            .quickPrompts {
              display: grid !important;
              grid-template-columns: 1fr !important;
              gap: 8px !important;
              overflow: visible !important;
              padding: 2px 0 6px !important;
            }

            .quickPrompts button {
              width: 100% !important;
              min-width: 0 !important;
              white-space: normal !important;
              justify-content: flex-start !important;
              text-align: left !important;
              line-height: 1.35 !important;
            }

            .composer textarea {
              min-width: 0;
            }

            .betaAdGrid {
              grid-template-columns: 1fr;
              gap: 9px;
            }

            .betaOwnBanner,
            .siteAdSlot {
              width: 100%;
              min-height: 54px;
            }

            .siteContact {
              margin-top: 13px;
              margin-bottom: 22px;
            }
          }
        `}</style>
      </body>
    </html>
  );
}
