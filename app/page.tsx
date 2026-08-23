const features = [
  ["01","Fault codes","Find likely causes, checks and the right manual section faster."],
  ["02","Manual search","Search technical documentation by manufacturer, controller and component."],
  ["03","Troubleshooting","Turn symptoms into a structured diagnostic path instead of guessing."]
];
const sources = ["Schindler","KONE","Otis","TKE","Ziehl-Abegg","NEW Lift","Weber","& more"];

export default function Home() {
  return <main>
    <header className="nav shell">
      <a className="brand" href="#"><span className="mark">↕</span><span>elevator<span className="dot">.</span>help</span></a>
      <div className="status"><i/>v0.2 · foundation</div>
    </header>

    <section className="hero shell">
      <div className="eyebrow">Built for elevator technicians</div>
      <h1>Find the answer.<br/><span>Get the lift moving.</span></h1>
      <p className="lead">A technical AI assistant for manuals, fault codes and troubleshooting — designed to give sourced answers instead of generic guesses.</p>

      <div className="assistantCard">
        <div className="assistantTop">
          <div><b>Elevator Agent</b><small>Web research + technical knowledge base</small></div>
          <span className="badge">AI SEARCH · NEXT</span>
        </div>
        <div className="queryBox">
          <span>↳ &nbsp; e.g. “KONE MonoSpace, fault 0026 — what should I check?”</span>
          <button>Ask</button>
        </div>
        <p className="note">Technical information is gathered from publicly available online sources and technical documentation. Sources will be shown with answers.</p>
        <div className="sourceRow"><small>Technical sources</small><div>{sources.map(x=><span key={x}>{x}</span>)}</div></div>
      </div>
    </section>

    <section className="features shell">{features.map(([n,t,d])=>
      <article key={t}><small>{n}</small><h2>{t}</h2><p>{d}</p></article>
    )}</section>

    <section className="principle"><div className="shell principleInner">
      <div><div className="eyebrow">The rule</div><h2>No invented answers.</h2></div>
      <p>elevator.help will prioritize technical documentation, research public sources when needed, cite the evidence and ask for the controller or model when the available information is not sufficient.</p>
    </div></section>

    <section className="partner shell"><div className="partnerCard">
      <div><div className="eyebrow">Industry partners</div><h2>Reach elevator professionals.</h2>
      <p>Advertising and partnership opportunities for manufacturers, suppliers and specialist service providers.</p></div>
      <div className="partnerAction"><span>Your company could be here.</span><a href="mailto:info@elevator.help">Become a partner →</a></div>
    </div></section>

    <footer className="shell footer"><div>© 2026 elevator.help</div><a href="mailto:info@elevator.help">info@elevator.help</a><div>Technician-first · Source-driven · Built to grow</div></footer>
  </main>;
}