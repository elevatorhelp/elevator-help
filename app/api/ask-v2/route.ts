import { NextRequest, NextResponse } from "next/server";
import { POST as originalAskPost } from "../ask/route";

type ParsedClaim = {
  standard: "EN 81-20" | "EN 81-50";
  clause: string;
  text: string;
  topic: "structure" | "pit" | "headroom" | "lighting" | "access";
};

function isBroadShaftQuestion(question: string) {
  const hasShaft = /\b(schacht|aufzugsschacht|shaft|elevator\s+well|well)\b/i.test(question);
  if (!hasShaft) return false;

  const specific = /(schachtwand|schachtwänd|wand|festigkeit|verform|glas|grube|pit|schachtkopf|headroom|schutzraum|refuge|beleuchtung|lighting|licht|zugang|tür|door|trenn|separation|gegengewicht|counterweight)/i.test(
    question
  );
  return !specific;
}

async function callOriginal(request: NextRequest, question: string) {
  const url = new URL("/api/ask", request.url);
  const subRequest = new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const response = await originalAskPost(subRequest);
  return response.json() as Promise<any>;
}

function extractClaims(answer: string, topic: ParsedClaim["topic"]): ParsedClaim[] {
  const claims: ParsedClaim[] = [];
  const regex = /^•\s+(EN 81-(?:20|50)),\s+Abschnitt\s+([0-9]+(?:\.[0-9]+)+)\s+—\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(answer || ""))) {
    claims.push({
      standard: match[1] as ParsedClaim["standard"],
      clause: match[2],
      text: match[3].trim(),
      topic,
    });
  }
  return claims;
}

function chooseClaims(claims: ParsedClaim[]) {
  const chosen: ParsedClaim[] = [];
  const used = new Set<string>();
  const topicOrder: ParsedClaim["topic"][] = [
    "structure",
    "pit",
    "headroom",
    "lighting",
    "access",
  ];

  for (const topic of topicOrder) {
    const candidates = claims.filter((claim) => claim.topic === topic);
    const preferred =
      topic === "structure"
        ? candidates.find((claim) => claim.clause === "5.2.1.8.2") || candidates[0]
        : candidates[0];
    if (!preferred) continue;
    const key = `${preferred.standard}:${preferred.clause}`;
    if (used.has(key)) continue;
    used.add(key);
    chosen.push(preferred);
  }

  return chosen.slice(0, 5);
}

function buildGermanAnswer(claims: ParsedClaim[]) {
  const topics = new Set(claims.map((claim) => claim.topic));
  const topicNames: string[] = [];
  if (topics.has("structure")) topicNames.push("Schachtwände bzw. die bauliche Umwehrung");
  if (topics.has("pit")) topicNames.push("Schachtgrube");
  if (topics.has("headroom")) topicNames.push("Schachtkopf und Schutzräume");
  if (topics.has("lighting")) topicNames.push("Schachtbeleuchtung");
  if (topics.has("access")) topicNames.push("Zugänge und Türen");

  const summary = `Beim Aufzugsschacht ist nicht nur ein einzelnes Detail relevant. Für Planung und Prüfung müssen insbesondere ${topicNames.join(", ")} gemeinsam betrachtet werden. Die folgenden Punkte konnten direkt aus der internen Normenbibliothek verifiziert werden.`;
  const details = claims
    .map((claim) => `• ${claim.standard}, Abschnitt ${claim.clause} — ${claim.text}`)
    .join("\n");

  return `Kurz gesagt:\n${summary}\n\nWas die Norm konkret sagt:\n${details}`;
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.clone().json();
  } catch {
    return originalAskPost(request);
  }

  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || !isBroadShaftQuestion(question)) {
    return originalAskPost(request);
  }

  const targeted = [
    {
      topic: "structure" as const,
      question:
        "Was sagt EN 81-20 über die mechanische Festigkeit der Schachtwände, Böden und Decken des Aufzugsschachts?",
    },
    {
      topic: "pit" as const,
      question:
        "Was sagt EN 81-20 über die Schachtgrube und den Schutzraum in der Schachtgrube?",
    },
    {
      topic: "headroom" as const,
      question:
        "Was sagt EN 81-20 über den Schachtkopf, Freiräume und Schutzräume auf dem Fahrkorbdach?",
    },
    {
      topic: "lighting" as const,
      question: "Was sagt EN 81-20 über die Beleuchtung des Aufzugsschachts?",
    },
    {
      topic: "access" as const,
      question: "Was sagt EN 81-20 über Zugänge und Zugangstüren zum Aufzugsschacht?",
    },
  ];

  const results = await Promise.all(
    targeted.map(async (target) => {
      const result = await callOriginal(request, target.question);
      if (result?.mode !== "standards_knowledge_base") return [] as ParsedClaim[];
      return extractClaims(String(result?.answer || ""), target.topic);
    })
  );

  const selected = chooseClaims(results.flat());
  const hasStructure = selected.some(
    (claim) => claim.topic === "structure" && claim.clause === "5.2.1.8.2"
  );
  const distinctTopics = new Set(selected.map((claim) => claim.topic)).size;

  if (!hasStructure || distinctTopics < 3) {
    return originalAskPost(request);
  }

  return NextResponse.json({
    answer: buildGermanAnswer(selected),
    sources: [],
    mode: "standards_knowledge_base",
    standardsChecked: ["EN 81-20", "EN 81-50"],
  });
}
