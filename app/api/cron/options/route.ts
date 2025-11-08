import { NextResponse } from "next/server";
import { fetchAllMarkPrices, fetchExchangeInfo, fetchIndexPrice, type MarkPriceEntry, type OptionSymbolInfo } from "@/lib/services/binance";
import { saveOptionSnapshot, saveSnapshotAggregate, type OptionSnapshotDoc } from "@/lib/repositories/option-snapshots";
import { buildSnapshotAggregate } from "@/lib/aggregations/option-snapshot";

export const dynamic = "force-dynamic";
// Ensure Node.js runtime (firebase-admin is not supported on the Edge runtime)
export const runtime = "nodejs";

export async function GET() {
    try {
        const [{ symbols }, markEntries] = await Promise.all([
            fetchExchangeInfo(),
            fetchAllMarkPrices(),
        ]);

        const byUnderlying = new Map<string, OptionSymbolInfo[]>();
        for (const s of symbols) {
            const arr = byUnderlying.get(s.underlying) ?? [];
            arr.push(s);
            byUnderlying.set(s.underlying, arr);
        }

        // Build a fast lookup for mark entries
        const markMap = new Map(markEntries.map((m) => [m.symbol, m] as const));

        const now = Date.now();
        let savedSnapshots = 0;
        let savedAggregates = 0;
        for (const [underlying, list] of byUnderlying.entries()) {
            const expiries = Array.from(new Set(list.map((s) => s.expiryDate))).sort((a, b) => a - b);
            // Index price per underlying
            let indexPrice = 0;
            try {
                indexPrice = await fetchIndexPrice(underlying);
            } catch { }

            const entries = list.map((s) => {
                const m: MarkPriceEntry | undefined = markMap.get(s.symbol);
                return {
                    symbol: s.symbol,
                    underlying: s.underlying,
                    expiryDate: s.expiryDate,
                    strikePrice: s.strikePrice,
                    side: s.side,
                    unit: s.unit,
                    markPrice: m?.markPrice ?? null,
                    bidIV: m?.bidIV ?? null,
                    askIV: m?.askIV ?? null,
                    markIV: (m as any)?.markIV ?? null,
                    delta: m?.delta ?? null,
                    theta: m?.theta ?? null,
                    gamma: m?.gamma ?? null,
                    vega: m?.vega ?? null,
                };
            });

            const snapshotPayload = {
                underlying,
                createdAt: now,
                indexPrice,
                expiries,
                symbols: entries,
            } satisfies Omit<OptionSnapshotDoc, "id">;

            const snapshotId = await saveOptionSnapshot(snapshotPayload);
            savedSnapshots++;

            try {
                const aggregate = buildSnapshotAggregate({
                    ...snapshotPayload,
                    id: snapshotId,
                });
                await saveSnapshotAggregate(underlying, aggregate);
                savedAggregates++;
            } catch (aggregateError) {
                console.error(`Failed to build aggregate for ${underlying} @ ${now}`, aggregateError);
            }
        }

        return NextResponse.json({ ok: true, savedSnapshots, savedAggregates, underlyings: byUnderlying.size });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
    }
}
