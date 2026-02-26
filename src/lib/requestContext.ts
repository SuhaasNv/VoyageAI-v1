import { AsyncLocalStorage } from "async_hooks";
import { NextRequest } from "next/server";

interface RequestContext {
    requestId: string | null;
    pathname?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | null {
    return storage.getStore()?.requestId ?? null;
}

export function getRequestPathname(): string | null {
    return storage.getStore()?.pathname ?? null;
}

export function runWithRequestContext<T>(
    req: NextRequest,
    fn: () => T | Promise<T>
): T | Promise<T> {
    const requestId = req.headers.get("x-request-id");
    const pathname = req.nextUrl.pathname;
    return storage.run({ requestId, pathname }, fn) as T | Promise<T>;
}
