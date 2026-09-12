import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const { env } = getCloudflareContext();

    const ai = (env as any).AI;

    const result = await ai.run(
      "@cf/baai/bge-base-en-v1.5",
      {
        text: [
          "LSU-GEBERFEHLER: Plausibilitätsprüfung der Fahrkorbposition über den Geber fehlerhaft.",
        ],
      }
    );

  const vectors = (result as { data: number[][] }).data;

    return Response.json({
      ok: true,
      count: vectors.length,
      dimensions: vectors[0]?.length ?? 0,
      firstValues: vectors[0]?.slice(0, 8) ?? [],
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