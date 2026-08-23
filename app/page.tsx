const features = [
  {
    icon: "01",
    title: "Fault codes",
    text: "Find likely causes, checks and the right manual section faster.",
  },
  {
    icon: "02",
    title: "Manual search",
    text: "Search technical documentation by manufacturer, controller and component.",
  },
  {
    icon: "03",
    title: "Troubleshooting",
    text: "Turn symptoms into a structured diagnostic path instead of guessing.",
  },
];

const sources = ["Schindler", "KONE", "Otis", "TKE", "Wittur", "Ziehl-Abegg"];

export default function Home() {
  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#" aria-label="elevator.help home">
          <span className="brandMark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>elevator<span className="dot">.</span>help</span>
        </a>

        <div className="status">
          <span className="statusDot" />
          v0.1 · foundation
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
              <div className="assistantLabel">Elevator Agent</div>
              <div className="assistantSub">Prototype interface · AI connection coming next</div>
            </div>
            <span className="badge">COMING SOON</span>
          </div>

          <div className="queryBox">
            <div className="queryText">
              <span className="promptIcon">↳</span>
              <span>e.g. “KONE MonoSpace, fault 0026 — what should I check?”</span>
            </div>
            <button type="button" aria-disabled="true">Ask</button>
          </div>

          <div className="sourceRow">
            <span>Planned sources</span>
            <div className="sourceList">
              {sources.map((source) => (
                <span key={source}>{source}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="features shell">
        {features.map((feature) => (
          <article className="feature" key={feature.title}>
            <div className="featureIndex">{feature.icon}</div>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
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
            The final agent will prioritize technical documentation, cite its sources,
            compare conflicting information and ask for the controller or model when
            the evidence is not sufficient.
          </p>
        </div>
      </section>

      <footer className="shell footer">
        <div>© 2026 elevator.help</div>
        <div>Technician-first · Source-driven · Built to grow</div>
      </footer>
    </main>
  );
}
