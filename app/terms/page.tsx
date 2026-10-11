import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen — elevator.help",
  description: "Nutzungsbedingungen für elevator.help",
};

export default function TermsPage() {
  return (
    <main className="legalPage">
      <article className="legalCard" lang="de">
        <Link className="legalBack" href="/">
          ← elevator.help
        </Link>

        <p className="legalEyebrow">Terms</p>
        <h1>Nutzungsbedingungen</h1>
        <p className="legalUpdated">Stand: 11. Oktober 2026</p>

        <section>
          <h2>1. Geltungsbereich</h2>
          <p>
            Diese Bedingungen gelten für die Nutzung von elevator.help. Der
            Dienst richtet sich an Personen, die technische Informationen rund
            um Aufzüge suchen. Kontakt: {" "}
            <a href="mailto:info@elevator.help">info@elevator.help</a>.
          </p>
        </section>

        <section>
          <h2>2. Nutzerkonto</h2>
          <p>
            Für bestimmte Funktionen kann ein verifiziertes Nutzerkonto
            erforderlich sein. Nutzer müssen zutreffende Angaben machen, ihre
            Zugangsdaten schützen und uns bei vermutetem Missbrauch unverzüglich
            informieren. Konten dürfen nicht ohne Zustimmung übertragen oder
            gemeinsam genutzt werden.
          </p>
        </section>

        <section>
          <h2>3. Technische Informationen</h2>
          <p>
            Antworten werden automatisiert aus verfügbaren Fachinformationen
            und KI-Modellen erstellt. Trotz sorgfältiger Verarbeitung können
            Antworten unvollständig, veraltet oder fehlerhaft sein. Angaben sind
            vor ihrer Anwendung anhand der aktuellen Herstellerunterlagen, der
            maßgeblichen Normen, der örtlichen Vorschriften und der konkreten
            Anlagenbedingungen zu prüfen.
          </p>
          <p>
            elevator.help ersetzt keine Gefährdungsbeurteilung, Prüfung,
            Freigabe oder Entscheidung einer entsprechend qualifizierten
            Fachperson. Bei Sicherheitsrisiken, Störungen oder Notfällen dürfen
            Maßnahmen nur nach den geltenden Sicherheitsregeln und durch
            autorisierte Fachkräfte erfolgen.
          </p>
        </section>

        <section>
          <h2>4. Zulässige Nutzung</h2>
          <p>
            Untersagt sind insbesondere rechtswidrige Nutzung, Umgehung von
            Sicherheits- oder Zugriffsbeschränkungen, automatisierter Missbrauch,
            Schadsoftware, Beeinträchtigung des Dienstes sowie der Versuch,
            fremde Konten oder nicht öffentliche Inhalte abzurufen.
          </p>
        </section>

        <section>
          <h2>5. Verfügbarkeit und Änderungen</h2>
          <p>
            Wir können Funktionen weiterentwickeln, begrenzen oder vorübergehend
            unterbrechen, insbesondere für Wartung, Sicherheit und
            Missbrauchsschutz. Eine ununterbrochene Verfügbarkeit wird nicht
            zugesagt. Wesentliche Änderungen dieser Bedingungen werden in
            geeigneter Form bekannt gemacht.
          </p>
        </section>

        <section>
          <h2>6. Rechte an Inhalten</h2>
          <p>
            Rechte an Marken, Herstellerunterlagen, Normen und sonstigen
            Drittinhalten verbleiben bei den jeweiligen Rechteinhabern. Die
            Nutzung von elevator.help überträgt keine Rechte an solchen
            Inhalten. Nutzer dürfen nur Inhalte übermitteln, zu deren Nutzung
            sie berechtigt sind.
          </p>
        </section>

        <section>
          <h2>7. Haftung</h2>
          <p>
            Es gelten die gesetzlichen Haftungsregeln. Soweit gesetzlich
            zulässig, haften wir nicht für Entscheidungen oder Maßnahmen, die
            allein auf einer automatisierten Antwort beruhen. Zwingende Haftung,
            insbesondere für Vorsatz, grobe Fahrlässigkeit sowie Schäden an
            Leben, Körper oder Gesundheit, bleibt unberührt.
          </p>
        </section>

        <section>
          <h2>8. Datenschutz und Schlussbestimmungen</h2>
          <p>
            Informationen zur Datenverarbeitung enthält unsere {" "}
            <Link href="/privacy">Datenschutzerklärung</Link>. Es gilt deutsches
            Recht, soweit dadurch zwingende Verbraucherschutzvorschriften des
            gewöhnlichen Aufenthaltsorts eines Nutzers nicht eingeschränkt
            werden.
          </p>
        </section>
      </article>
    </main>
  );
}
