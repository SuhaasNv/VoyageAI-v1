import { AsyncLocalStorage } from "async_hooks";
import { NextRequest } from "next/server";

interface RequestContext {
    requestId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | null {
    return storage.getStore()?.requestId ?? null;
}

export function runWithRequestContext<T>(
    req: NextRequest,
    fn: () => T | Promise<T>
): T | Promise<T> {
    const requestId = req.headers.get("x-request-id");
    return storage.run({ requestId }, fn) as T | Promise<T>;
}
