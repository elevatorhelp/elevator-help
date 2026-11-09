/**
 * Read-only Cloudflare edge traffic analytics.
 *
 * These metrics are Cloudflare HTTP *visits*, not unique users, page views,
 * or authenticated DAU/MAU. They cover the available data window only.
 * No client IP addresses are queried or stored.
 */
export type EdgeTraffic = {
  windowStart: string;
  windowEnd: string;
  visits: number | null;
  countries: Array<{ country: string; visits: number }>;
  source: "cloudflare_http_requests_adaptive";
  warning: string | null;
};

type GraphQLResponse = {
  data?: { viewer?: { zones?: Array<{
    totals?: Array<{ sum?: { visits?: number } }>;
    countries?: Array<{ dimensions?: { clientCountryName?: string }; sum?: { visits?: number } }>;
  }> } };
  errors?: Array<{ message?: string }>;
};

const QUERY = `query AdminTraffic($zoneTag: string, $start: Time, $end: Time) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      totals: httpRequestsAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: $start, datetime_lt: $end, clientRequestHTTPHost: "elevator.help", requestSource: "eyeball" }
      ) { sum { visits } }
      countries: httpRequestsAdaptiveGroups(
        limit: 20
        orderBy: [count_DESC]
        filter: { datetime_geq: $start, datetime_lt: $end, clientRequestHTTPHost: "elevator.help", requestSource: "eyeball" }
      ) { dimensions { clientCountryName } sum { visits } }
    }
  }
}`;

function safeCount(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null;
}
export function normalizeEdgeTraffic(raw: unknown, start: string, end: string): EdgeTraffic {
  const empty: EdgeTraffic = { windowStart: start, windowEnd: end, visits: null, countries: [], source: "cloudflare_http_requests_adaptive", warning: "Cloudflare traffic data unavailable" };
  if (!raw || typeof raw !== "object") return empty;
  const g = raw as GraphQLResponse;
  if (g.errors?.length) return empty;
  const zone = g.data?.viewer?.zones?.[0];
  if (!zone || !Array.isArray(zone.totals) || !Array.isArray(zone.countries)) return empty;
  const total = safeCount(zone.totals[0]?.sum?.visits);
  if (total === null) return empty;
  return {
    ...empty, visits: total,
    countries: zone.countries.map(row => {
      const name = row.dimensions?.clientCountryName;
      const visits = safeCount(row.sum?.visits);
      if (typeof name !== "string" || !/^[A-Za-z][A-Za-z .'-]{1,55}$/.test(name) || visits === null) return null;
      return { country: name, visits };
    }).filter((x): x is { country: string; visits: number } => x !== null),
    warning: "Cloudflare-defined visits, not unique visitors. Only the 20 highest-ranked country groups are requested; country breakdown can omit other countries and must not be summed as a global total. History outside this 7-day window is excluded.",
  };
}
export async function readEdgeTraffic(options: {
  zoneId?: string;
  token?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<EdgeTraffic | null> {
  const zoneId = options.zoneId?.trim();
  const token = options.token?.trim();
  // Missing Cloudflare zone ID or Analytics-only credential: never call API.
  if (!zoneId || !/^[a-f0-9]{32}$/i.test(zoneId) || !token) return null;
  const endDate = options.now ?? new Date();
  const startDate = new Date(endDate.getTime() - 7 * 86400_000);
  const start = startDate.toISOString();
  const end = endDate.toISOString();
  try {
    const response = await (options.fetchImpl ?? fetch)("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { zoneTag: zoneId, start, end } }),
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return normalizeEdgeTraffic(await response.json(), start, end);
  } catch {
    return null;
  }
}
