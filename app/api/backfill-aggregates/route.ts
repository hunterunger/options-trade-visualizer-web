import { NextResponse } from "next/server";
import {
    runAggregateBackfill,
    type AggregateBackfillOptions,
} from "@/lib/backfill/aggregate-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parseBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        if (value.toLowerCase() === "true") return true;
        if (value.toLowerCase() === "false") return false;
    }
    return undefined;
};

const parseNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

const coerceOptions = (
    input: Partial<AggregateBackfillOptions>
): AggregateBackfillOptions => {
    const options: AggregateBackfillOptions = {};
    if (input.underlying) options.underlying = input.underlying.toUpperCase();
    if (input.limit !== undefined) options.limit = input.limit;
    if (input.force !== undefined) options.force = input.force;
    if (input.dryRun !== undefined) options.dryRun = input.dryRun;
    return options;
};

const mergeOptionSources = (
    body: Record<string, unknown>,
    query: URLSearchParams
): AggregateBackfillOptions => {
    const underlying = (body.underlying as string | undefined) ?? query.get("underlying") ?? undefined;
    const limit =
        parseNumber(body.limit) ??
        (query.has("limit") ? parseNumber(query.get("limit")) : undefined);
    const force =
        parseBoolean(body.force) ??
        (query.has("force") ? parseBoolean(query.get("force")) : undefined);
    const dryRun =
        parseBoolean(body.dryRun) ??
        (query.has("dryRun") ? parseBoolean(query.get("dryRun")) : undefined);

    return coerceOptions({ underlying, limit, force, dryRun });
};

const authorizeRequest = (request: Request, searchParams: URLSearchParams) => {
    const requiredToken = process.env.BACKFILL_ENDPOINT_TOKEN;
    if (!requiredToken) return;

    const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
    const bearerToken = authHeader?.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : undefined;
    const queryToken = searchParams.get("token") ?? undefined;

    if (bearerToken === requiredToken || queryToken === requiredToken) {
        return;
    }

    throw new Error("Unauthorized");
};

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        const searchParams = url.searchParams;

        authorizeRequest(request, searchParams);

        let body: Record<string, unknown> = {};
        if (request.headers.get("content-type")?.includes("application/json")) {
            try {
                body = (await request.json()) as Record<string, unknown>;
            } catch {
                body = {};
            }
        }

        const options = mergeOptionSources(body, searchParams);
        const logs: string[] = [];

        const results = await runAggregateBackfill(options, {
            info: (message) => logs.push(message),
        });

        return NextResponse.json({ ok: true, options, results, logs });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message === "Unauthorized" ? 401 : 500;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}

export async function GET() {
    return NextResponse.json(
        {
            ok: false,
            error: "Use POST with JSON payload to run the aggregate backfill.",
        },
        { status: 405 }
    );
}
