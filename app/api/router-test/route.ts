import { routeQuestion } from "../../lib/router";
import { denyDiagnosticRequest } from "../../lib/diagnostic-auth";

export async function POST(request: Request) {
  const denied = denyDiagnosticRequest(request);
  if (denied) return denied;
  try {
    const body: any = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string") {
      return Response.json(
        { ok: false, error: "question is required" },
        { status: 400 }
      );
    }

    const route = await routeQuestion(question);

    return Response.json({
      ok: true,
      question,
      route,
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
