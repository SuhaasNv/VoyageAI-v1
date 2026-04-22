import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type LangGraphStatus = "ok" | "unreachable";

interface HealthResponse {
  status: "ok" | "degraded";
  langgraph?: LangGraphStatus;
}

export async function GET() {
  const response: HealthResponse = { status: "ok" };

  const lgUrl = process.env.LANGGRAPH_SERVICE_URL;
  if (lgUrl) {
    try {
      const res = await fetch(`${lgUrl}/health`, {
        signal: AbortSignal.timeout(5000),
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as { status?: string };
        response.langgraph = data.status === "ok" ? "ok" : "unreachable";
      } else {
        response.langgraph = "unreachable";
        response.status = "degraded";
      }
    } catch {
      response.langgraph = "unreachable";
      response.status = "degraded";
    }
  }

  return NextResponse.json(response, {
    status: response.status === "degraded" ? 503 : 200,
  });
}
