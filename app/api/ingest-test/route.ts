import { getCloudflareContext } from "@opennextjs/cloudflare";

type Chunk = {
  id: string;
  text: string;
  metadata: {
    manufacturer: string;
    controller: string;
    contentType: string;
    faultFamily: string;
    faultCode: string;
    faultName: string;
    page: number;
    document: string;
  };
};

const chunks: Chunk[] = [
  {
    id: "newlift-fst3-lsu-14",
    text:
      "LSU-ANFAHRPROBLEM. Der Fahrkorb fährt trotz aktiver Vorsteuerung nicht an. Vorsteuerrelais auf FST prüfen. Haupt-, Brems- und Ventil-Ansteuerungsschütze prüfen. Motor, Bremse und Ventile prüfen. Geschwindigkeit des Fahrkorbes beim Start viel zu gering.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "14",
      faultName: "LSU-ANFAHRPROBLEM",
      page: 184,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-15",
    text:
      "LSU-LAUFZEITUEBERWCH. Überwachungs- bzw. Fahrfehler. Eine Bewegung des Fahrkorbs während der Fahrt konnte nicht festgestellt werden. Die Geberposition ändert sich trotz aktiver Vorsteuerung nicht. Mögliche Ursachen: Antrieb bewegt sich nicht, keine elektrische Verbindung zum Geber, Geber defekt.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "15",
      faultName: "LSU-LAUFZEITUEBERWCH",
      page: 184,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-16",
    text:
      "LSU-GEBERFEHLER. Plausibilitätsprüfung der Fahrkorbposition über den Geber fehlerhaft. Mögliche Ursachen: Geber defekt, elektrische Verbindung zum Geber fehlerhaft, falsche Drehrichtung bei Inbetriebnahme, Geberwert außerhalb des Schachtbereichs, Geber bei eingeschalteter Steuerung ab- oder angesteckt.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "16",
      faultName: "LSU-GEBERFEHLER",
      page: 184,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-17",
    text:
      "LSU-KABIN. KOMMUNIKTN. Die Kommunikation zwischen FST Steuerung und Fahrkorbsteuermodul FSM-2 ist gestört. Mögliche Ursachen: lose oder nicht gesteckte Steckverbindungen des Flach-Hängekabels, Leitungsbruch, FSM-2 defekt, Jumperstellungen JK1 JK2 JK3 prüfen, temporärer Kurzschluss auf dem Kabinenbus.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "17",
      faultName: "LSU-KABIN. KOMMUNIKTN",
      page: 185,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-18",
    text:
      "LSU-GESCHW. ENDSCHLTR. Die Verzögerungskontrollschaltung in den Endhaltestellen hat angesprochen. Fehler kann über TESTMENUE Stoerungs Reset zurückgesetzt werden.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "18",
      faultName: "LSU-GESCHW. ENDSCHLTR",
      page: 185,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-19",
    text:
      "LSU-ZONE FEHLT. Keine Zonenmeldung vorhanden. Der Fahrkorb hat die Bündigposition erreicht, erhält aber keine Zonenmeldung vom Sicherheitsbaustein. Sicherheitsbaustein und Zonenmagnetschalter überprüfen.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "19",
      faultName: "LSU-ZONE FEHLT",
      page: 185,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-20",
    text:
      "LSU-BREMSE FEHLER. Die Bremsen sprechen nicht an oder lassen sich nicht lösen. Die Bremse öffnet trotz aktiver Vorsteuerung nicht oder schließt trotz Anhaltens nicht. Überwachung über Eingang FST X1D.6 und X1D.7.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "20",
      faultName: "LSU-BREMSE FEHLER",
      page: 185,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-21",
    text:
      "LSU-MOTOR FEHLER. Die Temperaturüberwachung des Antriebs hat angesprochen. Mögliche Ursache: überhitzter Motor. Überwachung über Eingang FST X1D.9.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "21",
      faultName: "LSU-MOTOR FEHLER",
      page: 185,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-22",
    text:
      "LSU-ZWANGSHALT. Das Eingangssignal Zwangshalt an einem programmierbaren Eingang war aktiv. Der Fahrkorb wird mit offener Tür in der Etage stillgesetzt. Welches Signal den Zwangshalt ausgelöst hat, ist den auftragsbezogenen Schaltplänen zu entnehmen.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "22",
      faultName: "LSU-ZWANGSHALT",
      page: 185,
      document: "mipa_FST-3_de.pdf",
    },
  },
  {
    id: "newlift-fst3-lsu-23",
    text:
      "LSU-NOTENDSCHALTER. Überfahren der untersten Etage bei Seilaufzügen oder der obersten Etage bei Hydraulikaufzügen nach EN81. Der Notendschalter unten bzw. oben hat angesprochen.",
    metadata: {
      manufacturer: "NEW LIFT",
      controller: "FST-3",
      contentType: "fault",
      faultFamily: "LSU",
      faultCode: "23",
      faultName: "LSU-NOTENDSCHALTER",
      page: 185,
      document: "mipa_FST-3_de.pdf",
    },
  },
];

export async function GET() {
  try {
    const { env } = getCloudflareContext();

    const ai = (env as any).AI;
    const vectorize = (env as any).VECTORIZE;

    const vectors = [];

    for (const chunk of chunks) {
      const embeddingResult = await ai.run(
        "@cf/baai/bge-base-en-v1.5",
        {
          text: [chunk.text],
        }
      );

      const embedding = (embeddingResult as any).data?.[0];

      if (!embedding) {
        throw new Error(`No embedding returned for ${chunk.id}`);
      }

      vectors.push({
        id: chunk.id,
        values: embedding,
        metadata: chunk.metadata,
      });
    }

    await vectorize.upsert(vectors);

    return Response.json({
      ok: true,
      inserted: vectors.length,
      ids: vectors.map((v) => v.id),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
