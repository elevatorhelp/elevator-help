export function denyDiagnosticRequest(request: Request): Response | null {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIAGNOSTICS_ENABLED !== "true"
  ) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const token = process.env.INGESTION_TOKEN;
  const authorization = request.headers.get("authorization");
  if (!token || authorization !== `Bearer ${token}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return null;
}
