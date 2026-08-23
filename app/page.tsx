"use client";

import { FormEvent, useState } from "react";

type Source = {
  title: string;
  url: string;
};

type AskResponse = {
  answer?: string;
  sources?: Source[];
  disclosure?: string;
  error?: string;
};

const features = [
  [
    "01",
    "Fault codes",
    "Find likely causes, checks and the right manual section faster.",
  ],
  [
    "02",
    "Manual search",
    "Search technical documentation by manufacturer, controller and component.",
  ],
  [
    "03",
    "Troubleshooting",
    "Turn symptoms into a structured diagnostic path instead of guessing.",
  ],
];

const sources = [
  "Schindler",
  "KONE",
  "Otis",
  "TKE",
  "Ziehl-Abegg",
  "NEW Lift",
  "Weber",
  "& more",
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [references, setReferences] = useState<Source[]>([]);
  const [disclosure, setDisclosure] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuestion = question.trim();

    if (!cleanQuestion || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setAnswer("");
    setReferences([]);
    setDisclosure("");

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: cleanQuestion,
        }),
      });

      const data: AskResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "The technical search could not be completed."
        );
      }

      setAnswer(data.answer || "No verified answer was returned.");
      setReferences(data.sources || []);
      setDisclosure(
        data.disclosure ||
          "Technical information is gathered from publicly available online sources and technical documentation."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while processing the question."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#">
          <span className="mark">↕</span>
          <span>
            elevator<span className="dot">.</span>help
          </span>
        </a>

        <div className="status">
          <i />
          v0.3 · AI search
        </div>
      </header>

      <section className="hero shell">
        <div className="eyebrow">Built for elevator technicians</div>

        <h1>
          Find the answer.
          <br />
          <span>Get the lift moving.</span>
        </h1>

        <p className="lead">
          A technical AI assistant for manuals, fault codes and troubleshooting —
          designed to give sourced answers instead of generic guesses.
        </p>

        <div className="assistantCard">
          <div className="assistantTop">
            <div>
              <b>Elevator Agent</b>
              <small>
                Technical web research + Online Troubleshooting Process
              </small>
            </div>

            <span className="badge">
              {loading ? "SEARCHING..." : "AI SEARCH · ONLINE"}
            </span>
          </div>

          <form className="queryBox" onSubmit={handleSubmit}>
            <span className="queryPrompt">↳</span>

            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder='e.g. "KONE MonoSpace, fault 0026 — what should I check?"'
              disabled={loading}
              aria-label="Ask Elevator Agent"
            />

            <button type="submit" disabled={loading || !question.trim()}>
              {loading ? "Searching..." : "Ask"}
            </button>
          </form>

          {loading && (
            <div className="searchState">
              Searching technical sources and building a diagnostic path...
            </div>
          )}

          {error && (
            <div className="answerPanel errorPanel">
              <b>Search error</b>
              <p>{error}</p>
            </div>
          )}

          {answer && (
            <section className="answerPanel">
              <div className="answerHeader">
                <div>
                  <span className="answerEyebrow">Technical answer</span>
                  <h2>Elevator Agent</h2>
                </div>

                <span className="verifiedBadge">SOURCE-BASED</span>
              </div>

              <div className="answerText">{answer}</div>

              <div className="answerFooter">
                <div className="references">
                  <h3>References</h3>

                  {references.length > 0 ? (
                    <ol>
                      {references.map((source, index) => (
                        <li key={`${source.url}-${index}`}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No external reference links were returned.</p>
                  )}
                </div>

                <p className="answerDisclosure">{disclosure}</p>
              </div>
            </section>
          )}

          {!answer && !loading && !error && (
            <p className="note">
              Technical information is gathered from publicly available online
              sources and technical documentation. Sources will be shown with
              answers.
            </p>
          )}

          <div className="sourceRow">
            <small>Technical sources</small>

            <div>
              {sources.map((source) => (
                <span key={source}>{source}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="features shell">
        {features.map(([number, title, description]) => (
          <article key={title}>
            <small>{number}</small>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section className="principle">
        <div className="shell principleInner">
          <div>
            <div className="eyebrow">The rule</div>
            <h2>No invented answers.</h2>
          </div>

          <p>
            elevator.help will prioritize technical documentation, research
            public sources when needed, cite the evidence and ask for the
            controller or model when the available information is not sufficient.
          </p>
        </div>
      </section>

      <section className="partner shell">
        <div className="partnerCard">
          <div>
            <div className="eyebrow">Industry partners</div>
            <h2>Reach elevator professionals.</h2>

            <p>
              Advertising and partnership opportunities for manufacturers,
              suppliers and specialist service providers.
            </p>
          </div>

          <div className="partnerAction">
            <span>Your company could be here.</span>

            <a href="mailto:info@elevator.help">
              Become a partner →
            </a>
          </div>
        </div>
      </section>

      <footer className="shell footer">
        <div>© 2026 elevator.help</div>

        <a href="mailto:info@elevator.help">
          info@elevator.help
        </a>

        <div>Technician-first · Source-driven · Built to grow</div>
      </footer>
    </main>
  );
}
