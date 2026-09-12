import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request: Request) {
  try {
    const body: any = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string") {
      return Response.json(
        { ok: false, error: "question is required" },
        { status: 400 }
      );
    }

    const { env } = getCloudflareContext();

    const ai = (env as any).AI;
    const vectorize = (env as any).VECTORIZE;

    // 1. Create an embedding from the user's question
    const embeddingResult = await ai.run(
      "@cf/baai/bge-base-en-v1.5",
      {
        text: [question],
      }
    );

    const queryVector =
      (embeddingResult as any).data?.[0];

    if (!queryVector) {
      throw new Error("No query embedding returned");
    }

    // 2. Search only inside our NEW LIFT / FST-3 / LSU knowledge
    const result = await vectorize.query(
      queryVector,
      {
        topK: 5,
        returnMetadata: "all",
        filter: {
          manufacturer: "NEW LIFT",
          controller: "FST-3",
          contentType: "fault",
          faultFamily: "LSU",
        },
      }
    );

    return Response.json({
      ok: true,
      question,
      matches: result.matches.map((match: any) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata,
      })),
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