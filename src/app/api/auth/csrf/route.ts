import { NextRequest, NextResponse } from "next/server";
import { generateCsrfToken } from "@/services/auth/csrf";
import { serializeCsrfCookie } from "@/services/auth/cookies";
import { successResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const csrfToken = generateCsrfToken();
        const response = successResponse({ csrfToken });
        response.headers.append("Set-Cookie", serializeCsrfCookie(csrfToken));
        return response;
    });
}
