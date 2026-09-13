"use client";

import {
  FormEvent,
  ReactNode,
  useRef,
  useState,
} from "react";

type ReferenceItem = {
  title?: string;
  url?: string;
  label?: string;
  source?: string;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  references?: ReferenceItem[];
  disclosure?: string;
};

const quickPrompts = [
  {
    icon: "⚠️",
    title: "Troubleshoot a fault",
    prompt:
      "I have an elevator fault. Help me troubleshoot it step by step.",
  },
  {
    icon: "📄",
    title: "Search technical documentation",
    prompt:
      "Help me find information in technical elevator documentation.",
  },
  {
    icon: "📐",
    title: "Ask about EN 81-20/50",
    prompt:
      "What does EN 81-20/50 say about ",
  },
  {
    icon: "🏗️",
    title: "Plan shaft dimensions",
    prompt:
      "I am an architect. Help me determine suitable elevator shaft dimensions for my project.",
  },
];

function Logo() {
  return (
    <div className="logo">
      <div className="logoMark" aria-hidden="true">
        <svg viewBox="0 0 36 36">
          <rect
            x="7"
            y="4"
            width="22"
            height="28"
            rx="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M18 9v18M13 13l5-5 5 5M13 23l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <span>
        elevator<span className="logoDot">.help</span>
      </span>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4.5 17 4.5-4 3.2 2.6 2.7-2.4 4.6 3.8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5M10 13h5M10 17h5" />
    </svg>
  );
}

function SendBox({
  value,
  onChange,
  onSubmit,
  loading,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  compact?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(
    null
  );

  const photoInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  function handlePhotoSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploadMessage(
      `${file.name} selected — photo analysis will be connected to the upload pipeline.`
    );

    setMenuOpen(false);
  }

  function handleDocumentSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploadMessage(
      `${file.name} selected — document analysis will be connected to the upload pipeline.`
    );

    setMenuOpen(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className={`composerWrap ${compact ? "compact" : ""}`}>
      <form className="composer" onSubmit={submit}>
        <div className="plusArea">
          <button
            type="button"
            className="roundButton plusButton"
            aria-label="Add photo or document"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <PlusIcon />
          </button>

          {menuOpen && (
            <div className="uploadMenu">
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
              >
                <span className="menuIcon">
                  <PhotoIcon />
                </span>
                <span>
                  <strong>Send a photo</strong>
                  <small>
                    Controller, display, component or fault message
                  </small>
                </span>
              </button>

              <button
                type="button"
                onClick={() => documentInput.current?.click()}
              >
                <span className="menuIcon">
                  <FileIcon />
                </span>
                <span>
                  <strong>Upload technical document</strong>
                  <small>
                    Manual, wiring diagram or technical file
                  </small>
                </span>
              </button>
            </div>
          )}

          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={handlePhotoSelected}
          />

          <input
            ref={documentInput}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            hidden
            onChange={handleDocumentSelected}
          />
        </div>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ask about a fault, controller, component, standard or project…"
          rows={1}
          disabled={loading}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();

              if (value.trim() && !loading) {
                onSubmit();
              }
            }
          }}
        />

        <button
          className="roundButton sendButton"
          type="submit"
          aria-label="Send question"
          disabled={!value.trim() || loading}
        >
          {loading ? (
            <span className="spinner" />
          ) : (
            <ArrowIcon />
          )}
        </button>
      </form>

      {uploadMessage && (
        <div className="uploadMessage">
          {uploadMessage}
        </div>
      )}
    </div>
  );
}

function SourceList({
  references,
}: {
  references?: ReferenceItem[];
}) {
  if (!references?.length) return null;

  return (
    <div className="sources">
      <div className="sourcesTitle">
        Sources &amp; References
      </div>

      <div className="sourceList">
        {references.map((reference, index) => {
          const name =
            reference.title ||
            reference.label ||
            reference.source ||
            `Source ${index + 1}`;

          if (reference.url) {
            return (
              <a
                key={`${name}-${index}`}
                href={reference.url}
                target="_blank"
                rel="noreferrer"
              >
                {name}
              </a>
            );
          }

          return (
            <span key={`${name}-${index}`}>
              {name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Bubble({
  children,
  role,
}: {
  children: ReactNode;
  role: "user" | "assistant";
}) {
  return (
    <div className={`messageRow ${role}`}>
      <div className="messageInner">
        {role === "assistant" && (
          <div className="assistantAvatar">
            <svg viewBox="0 0 36 36">
              <rect
                x="8"
                y="4"
                width="20"
                height="28"
                rx="5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M18 9v18M14 13l4-4 4 4M14 23l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        <div className="messageContent">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasConversation = messages.length > 0;

  async function ask(customQuestion?: string) {
    const finalQuestion = (
      customQuestion ?? question
    ).trim();

    if (!finalQuestion || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      text: finalQuestion,
    };

    setMessages((current) => [
      ...current,
      userMessage,
    ]);

    setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: finalQuestion,
        }),
      });

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Request failed with status ${response.status}`
        );
      }

      const answer =
        typeof data?.answer === "string"
          ? data.answer
          : typeof data?.text === "string"
            ? data.text
            : typeof data?.response === "string"
              ? data.response
              : "I could not generate a technical answer.";

      const rawReferences =
        Array.isArray(data?.references)
          ? data.references
          : Array.isArray(data?.sources)
            ? data.sources
            : [];

      const references: ReferenceItem[] =
        rawReferences.map((item: any) => {
          if (typeof item === "string") {
            return {
              title: item,
            };
          }

          return {
            title:
              item?.title ||
              item?.name ||
              item?.label,
            label: item?.label,
            source: item?.source,
            url:
              item?.url ||
              item?.uri ||
              item?.link,
          };
        });

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        text: answer,
        references,
        disclosure:
          typeof data?.disclosure === "string"
            ? data.disclosure
            : undefined,
      };

      setMessages((current) => [
        ...current,
        assistantMessage,
      ]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : String(requestError);

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function useQuickPrompt(prompt: string) {
    setQuestion(prompt);
  }

  return (
    <main className="page">
      <header className="header">
        <Logo />

        <div className="headerRight">
          <span className="statusDot" />
          <span>Development</span>
        </div>
      </header>

      {!hasConversation ? (
        <section className="landing">
          <div className="landingInner">
            <div className="eyebrow">
              The Elevator AI Assistant
            </div>

            <h1>
              Find the answer.
              <br />
              <span>Get the lift moving.</span>
            </h1>

            <p className="subtitle">
              Technical knowledge, documentation and guided
              troubleshooting for elevator technicians,
              engineers, inspectors and architects.
            </p>

            <div className="runningLine">
              <span className="check">✓</span>
              Let&apos;s keep your elevator running.
            </div>

            <h2>
              How can I help with your elevator today?
            </h2>

            <SendBox
              value={question}
              onChange={setQuestion}
              onSubmit={() => ask()}
              loading={loading}
            />

            <div className="quickPrompts">
              {quickPrompts.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() =>
                    useQuickPrompt(item.prompt)
                  }
                >
                  <span className="promptIcon">
                    {item.icon}
                  </span>

                  <span>{item.title}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  const input =
                    document.querySelector<HTMLInputElement>(
                      'input[accept="image/*"]'
                    );

                  input?.click();
                }}
              >
                <span className="promptIcon">📷</span>
                <span>Send a photo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const input =
                    document.querySelector<HTMLInputElement>(
                      'input[accept=".pdf,.doc,.docx,.txt"]'
                    );

                  input?.click();
                }}
              >
                <span className="promptIcon">📎</span>
                <span>Upload a document</span>
              </button>
            </div>

            {error && (
              <div className="errorBox">
                {error}
              </div>
            )}

            <div className="landingFootnote">
              elevator.help can make mistakes. Verify
              safety-critical information against current
              technical documentation and applicable standards.
            </div>
          </div>
        </section>
      ) : (
        <section className="chatView">
          <div className="conversation">
            {messages.map((message) => (
              <Bubble
                key={message.id}
                role={message.role}
              >
                <div className="messageText">
                  {message.text}
                </div>

                {message.role === "assistant" && (
                  <>
                    <SourceList
                      references={message.references}
                    />

                    {message.disclosure && (
                      <div className="disclosure">
                        {message.disclosure}
                      </div>
                    )}
                  </>
                )}
              </Bubble>
            ))}

            {loading && (
              <Bubble role="assistant">
                <div className="thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </Bubble>
            )}

            {error && (
              <div className="chatError">
                {error}
              </div>
            )}
          </div>

          <div className="stickyComposer">
            <SendBox
              value={question}
              onChange={setQuestion}
              onSubmit={() => ask()}
              loading={loading}
              compact
            />

            <div className="composerDisclaimer">
              Technical guidance should be verified
              against current manufacturer documentation,
              applicable standards and site conditions.
            </div>
          </div>
        </section>
      )}

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #151b18;
        }

        body {
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button,
        textarea {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        .page {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 50% 8%,
              rgba(22, 163, 74, 0.045),
              transparent 28rem
            ),
            #ffffff;
        }

        .header {
          height: 72px;
          width: 100%;
          padding: 0 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 20px;
          font-weight: 720;
          letter-spacing: -0.5px;
        }

        .logoMark {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          color: #159447;
        }

        .logoMark svg {
          width: 31px;
          height: 31px;
        }

        .logoDot {
          color: #159447;
        }

        .headerRight {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #7b827f;
          font-size: 12px;
          font-weight: 560;
        }

        .statusDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #26aa5a;
          box-shadow: 0 0 0 4px rgba(38, 170, 90, 0.09);
        }

        .landing {
          min-height: calc(100vh - 72px);
          display: flex;
          justify-content: center;
          padding: 7vh 22px 50px;
        }

        .landingInner {
          width: min(880px, 100%);
          text-align: center;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          min-height: 31px;
          padding: 6px 13px;
          border-radius: 999px;
          border: 1px solid #dce7df;
          background: rgba(255, 255, 255, 0.85);
          color: #177940;
          font-size: 13px;
          font-weight: 650;
          margin-bottom: 20px;
        }

        h1 {
          margin: 0;
          font-size: clamp(42px, 6vw, 72px);
          line-height: 0.98;
          letter-spacing: -3.7px;
          font-weight: 760;
        }

        h1 span {
          color: #188c47;
        }

        .subtitle {
          width: min(680px, 100%);
          margin: 24px auto 0;
          color: #656d69;
          font-size: 17px;
          line-height: 1.62;
        }

        .runningLine {
          margin-top: 26px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #5d6662;
          font-size: 14px;
          font-weight: 550;
        }

        .check {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          display: grid;
          place-items: center;
          background: #e6f7ec;
          color: #169449;
          font-size: 13px;
          font-weight: 800;
        }

        h2 {
          margin: 56px 0 22px;
          color: #232925;
          font-size: clamp(23px, 3vw, 31px);
          letter-spacing: -1px;
          font-weight: 520;
        }

        .composerWrap {
          width: 100%;
          position: relative;
        }

        .composer {
          position: relative;
          min-height: 72px;
          display: flex;
          align-items: flex-end;
          gap: 9px;
          padding: 10px 10px 10px 11px;
          background: #ffffff;
          border: 1px solid #dfe5e1;
          border-radius: 28px;
          box-shadow:
            0 10px 35px rgba(25, 40, 31, 0.06),
            0 2px 7px rgba(25, 40, 31, 0.035);
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .composer:focus-within {
          border-color: #bccbc1;
          box-shadow:
            0 14px 42px rgba(25, 40, 31, 0.075),
            0 2px 8px rgba(25, 40, 31, 0.04);
        }

        .composer textarea {
          flex: 1;
          resize: none;
          border: 0;
          outline: 0;
          background: transparent;
          min-height: 48px;
          max-height: 150px;
          padding: 14px 4px 9px;
          color: #1d231f;
          font-size: 16px;
          line-height: 1.45;
          overflow-y: auto;
        }

        .composer textarea::placeholder {
          color: #919a95;
        }

        .roundButton {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          border-radius: 50%;
          border: 0;
          display: grid;
          place-items: center;
          cursor: pointer;
          transition:
            transform 0.16s ease,
            background 0.16s ease,
            opacity 0.16s ease;
        }

        .roundButton:hover:not(:disabled) {
          transform: scale(1.035);
        }

        .roundButton svg {
          width: 22px;
          height: 22px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .plusButton {
          background: #f2f5f3;
          color: #4c5550;
        }

        .plusButton:hover {
          background: #e9eeeb;
        }

        .sendButton {
          background: #1b211d;
          color: white;
        }

        .sendButton:disabled {
          opacity: 0.28;
          cursor: default;
        }

        .plusArea {
          position: relative;
        }

        .uploadMenu {
          position: absolute;
          z-index: 20;
          bottom: 54px;
          left: 0;
          width: 310px;
          padding: 7px;
          border-radius: 17px;
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid #e2e8e4;
          box-shadow: 0 15px 45px rgba(24, 38, 29, 0.13);
          text-align: left;
        }

        .uploadMenu button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: #29302c;
          cursor: pointer;
          text-align: left;
        }

        .uploadMenu button:hover {
          background: #f5f7f5;
        }

        .uploadMenu strong {
          display: block;
          font-size: 13px;
          margin-bottom: 2px;
        }

        .uploadMenu small {
          display: block;
          color: #87908b;
          font-size: 11px;
          line-height: 1.35;
        }

        .menuIcon {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: #edf7f0;
          color: #168b45;
        }

        .menuIcon svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.7;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .uploadMessage {
          margin: 8px 6px 0;
          color: #7c8580;
          font-size: 11px;
          text-align: left;
        }

        .quickPrompts {
          margin: 14px auto 0;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }

        .quickPrompts button {
          min-height: 38px;
          padding: 8px 13px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid #e1e7e3;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.85);
          color: #525b56;
          cursor: pointer;
          font-size: 12px;
          font-weight: 570;
          transition:
            background 0.16s ease,
            border-color 0.16s ease,
            transform 0.16s ease;
        }

        .quickPrompts button:hover {
          background: #f8faf8;
          border-color: #cfd9d2;
          transform: translateY(-1px);
        }

        .promptIcon {
          font-size: 14px;
        }

        .landingFootnote {
          margin: 31px auto 0;
          max-width: 630px;
          color: #a0a7a3;
          font-size: 11px;
          line-height: 1.55;
        }

        .errorBox,
        .chatError {
          margin-top: 14px;
          padding: 11px 14px;
          border: 1px solid #f1c7c7;
          border-radius: 12px;
          color: #9a3434;
          background: #fff8f8;
          font-size: 13px;
        }

        .chatView {
          min-height: calc(100vh - 72px);
          display: flex;
          flex-direction: column;
        }

        .conversation {
          width: 100%;
          flex: 1;
          padding: 26px 0 185px;
        }

        .messageRow {
          width: 100%;
          padding: 20px 22px;
        }

        .messageInner {
          width: min(800px, 100%);
          margin: 0 auto;
          display: flex;
          gap: 14px;
        }

        .messageRow.user .messageInner {
          justify-content: flex-end;
        }

        .messageRow.user .messageContent {
          max-width: min(650px, 88%);
          padding: 11px 15px;
          border-radius: 20px 20px 6px 20px;
          background: #f0f3f1;
        }

        .messageRow.assistant .messageContent {
          flex: 1;
          max-width: 720px;
          padding-top: 4px;
        }

        .assistantAvatar {
          width: 31px;
          height: 31px;
          flex: 0 0 31px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          background: #eaf6ee;
          color: #168e47;
        }

        .assistantAvatar svg {
          width: 21px;
          height: 21px;
        }

        .messageText {
          color: #252b27;
          white-space: pre-wrap;
          font-size: 15px;
          line-height: 1.72;
        }

        .sources {
          margin-top: 22px;
          padding-top: 17px;
          border-top: 1px solid #e7ebe8;
        }

        .sourcesTitle {
          margin-bottom: 9px;
          color: #5e6862;
          font-size: 12px;
          font-weight: 700;
        }

        .sourceList {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .sourceList a,
        .sourceList span {
          padding: 6px 9px;
          border-radius: 9px;
          border: 1px solid #e1e6e3;
          background: #fafbfa;
          color: #59625d;
          text-decoration: none;
          font-size: 11px;
        }

        .sourceList a:hover {
          border-color: #bfd0c5;
          color: #1d7741;
        }

        .disclosure {
          margin-top: 14px;
          color: #949c97;
          font-size: 11px;
          line-height: 1.55;
        }

        .stickyComposer {
          position: fixed;
          z-index: 15;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 22px 20px 14px;
          background:
            linear-gradient(
              to top,
              #ffffff 68%,
              rgba(255, 255, 255, 0)
            );
        }

        .stickyComposer > .composerWrap {
          width: min(800px, 100%);
          margin: 0 auto;
        }

        .compact .composer {
          min-height: 62px;
          border-radius: 25px;
        }

        .compact .composer textarea {
          min-height: 42px;
          padding-top: 11px;
        }

        .composerDisclaimer {
          width: min(800px, 100%);
          margin: 7px auto 0;
          color: #a2aaa5;
          text-align: center;
          font-size: 10px;
          line-height: 1.4;
        }

        .thinking {
          height: 28px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .thinking span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #87908a;
          animation: thinking 1.1s infinite ease-in-out;
        }

        .thinking span:nth-child(2) {
          animation-delay: 0.13s;
        }

        .thinking span:nth-child(3) {
          animation-delay: 0.26s;
        }

        .spinner {
          width: 17px;
          height: 17px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: white;
          animation: spin 0.8s linear infinite;
        }

        @keyframes thinking {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }

          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 700px) {
          .header {
            height: 62px;
            padding: 0 16px;
          }

          .headerRight {
            display: none;
          }

          .landing {
            min-height: calc(100vh - 62px);
            padding: 6vh 14px 35px;
          }

          .eyebrow {
            margin-bottom: 17px;
          }

          h1 {
            font-size: clamp(40px, 12vw, 56px);
            letter-spacing: -2.5px;
          }

          .subtitle {
            font-size: 15px;
            line-height: 1.55;
          }

          h2 {
            margin-top: 42px;
            font-size: 23px;
          }

          .composer {
            min-height: 66px;
            border-radius: 24px;
          }

          .composer textarea {
            font-size: 15px;
          }

          .quickPrompts {
            justify-content: flex-start;
            overflow-x: auto;
            flex-wrap: nowrap;
            padding: 2px 1px 6px;
            scrollbar-width: none;
          }

          .quickPrompts::-webkit-scrollbar {
            display: none;
          }

          .quickPrompts button {
            white-space: nowrap;
            flex: 0 0 auto;
          }

          .messageRow {
            padding: 17px 14px;
          }

          .messageRow.user .messageContent {
            max-width: 90%;
          }

          .assistantAvatar {
            width: 29px;
            height: 29px;
            flex-basis: 29px;
          }

          .stickyComposer {
            padding-left: 11px;
            padding-right: 11px;
          }

          .uploadMenu {
            width: min(310px, calc(100vw - 40px));
          }
        }
      `}</style>
    </main>
  );
}