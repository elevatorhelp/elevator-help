import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — elevator.help",
  description: "Datenschutzerklärung für elevator.help",
};

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <article className="legalCard" lang="de">
        <Link className="legalBack" href="/">
          ← elevator.help
        </Link>

        <p className="legalEyebrow">Privacy</p>
        <h1>Datenschutzerklärung</h1>
        <p className="legalUpdated">Stand: 11. Oktober 2026</p>

        <section>
          <h2>1. Verantwortlicher und Kontakt</h2>
          <p>
            Verantwortlich für diesen Online-Dienst ist Elevator Help. Bei
            Fragen zum Datenschutz oder zur Ausübung deiner Rechte erreichst
            du uns unter <a href="mailto:info@elevator.help">info@elevator.help</a>.
          </p>
        </section>

        <section>
          <h2>2. Welche Daten wir verarbeiten</h2>
          <ul>
            <li>
              <strong>Kontodaten:</strong> E-Mail-Adresse, Verifizierungsstatus,
              interne Nutzerkennung sowie – falls gewählt – grundlegende
              Profildaten aus der Google-Anmeldung.
            </li>
            <li>
              <strong>Anmeldedaten:</strong> Passwörter werden durch unseren
              Authentifizierungsdienst verarbeitet und nicht im Klartext an
              elevator.help übermittelt.
            </li>
            <li>
              <strong>Anfragen:</strong> Deine Fragen, der für die Antwort
              erforderliche aktuelle Gesprächskontext und technisch notwendige
              Metadaten werden zur Erstellung einer Antwort verarbeitet.
            </li>
            <li>
              <strong>Technische Daten:</strong> Dazu können IP-Adresse,
              Zeitpunkt, Browserinformationen sowie Sicherheits- und
              Fehlerprotokolle gehören.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Zweck und Rechtsgrundlagen</h2>
          <p>
            Wir verarbeiten Daten, um Nutzerkonten bereitzustellen, E-Mail-
            Adressen zu verifizieren, den Dienst sicher zu betreiben, Anfragen
            zu beantworten und Missbrauch zu verhindern. Rechtsgrundlagen sind
            insbesondere Art. 6 Abs. 1 lit. b DSGVO (Nutzungsverhältnis) und
            Art. 6 Abs. 1 lit. f DSGVO (sicherer und zuverlässiger Betrieb).
            Soweit eine Einwilligung erforderlich ist, gilt Art. 6 Abs. 1 lit. a
            DSGVO.
          </p>
        </section>

        <section>
          <h2>4. Eingesetzte Dienstleister</h2>
          <ul>
            <li>
              <strong>Clerk:</strong> Kontoerstellung, Anmeldung,
              Sitzungsverwaltung und E-Mail-Verifizierung.
            </li>
            <li>
              <strong>Google:</strong> optionaler „Mit Google anmelden“-Dienst
              und Verarbeitung von KI-Anfragen durch die Gemini API.
            </li>
            <li>
              <strong>Cloudflare:</strong> Hosting, Auslieferung,
              Sicherheitsfunktionen und technische Protokollierung.
            </li>
          </ul>
          <p>
            Bei diesen Verarbeitungen können Daten außerhalb des Europäischen
            Wirtschaftsraums verarbeitet werden. In diesem Fall stützen die
            Anbieter die Übermittlung auf die jeweils anwendbaren gesetzlichen
            Schutzmechanismen.
          </p>
        </section>

        <section>
          <h2>5. Gesprächsverlauf und Speicherdauer</h2>
          <p>
            elevator.help stellt derzeit keinen dauerhaft gespeicherten,
            kontobezogenen Chatverlauf bereit. Der aktuelle Gesprächskontext
            wird nur soweit erforderlich an die Antwortdienste übermittelt.
            Technische Sicherheits- und Fehlerprotokolle können zeitlich
            begrenzt gespeichert werden. Kontodaten werden grundsätzlich bis
            zur Löschung des Kontos oder bis zum Wegfall des Verarbeitungszwecks
            verarbeitet; gesetzliche Aufbewahrungspflichten bleiben unberührt.
          </p>
        </section>

        <section>
          <h2>6. Cookies und lokale Speicherung</h2>
          <p>
            Wir verwenden technisch notwendige Cookies oder vergleichbare
            Speichermechanismen für Anmeldung, Sitzungsschutz und Sicherheit.
            Werbe- oder Tracking-Cookies setzen wir derzeit nicht ein.
          </p>
        </section>

        <section>
          <h2>7. Deine Rechte</h2>
          <p>
            Du hast im gesetzlichen Umfang Rechte auf Auskunft, Berichtigung,
            Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
            Widerspruch. Erteilte Einwilligungen kannst du mit Wirkung für die
            Zukunft widerrufen. Außerdem kannst du dich bei einer zuständigen
            Datenschutzaufsichtsbehörde beschweren.
          </p>
        </section>

        <section>
          <h2>8. Änderungen</h2>
          <p>
            Wir aktualisieren diese Erklärung, wenn sich Funktionen,
            Dienstleister oder rechtliche Anforderungen ändern. Die jeweils
            aktuelle Fassung ist unter dieser Adresse abrufbar.
          </p>
        </section>
      </article>
    </main>
  );
}
