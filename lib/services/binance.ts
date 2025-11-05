// Lightweight Binance Options market data client (public endpoints only)
// Docs: https://developers.binance.com/docs/derivatives/option/general-info

export type OptionSide = "CALL" | "PUT";

export interface OptionSymbolInfo {
    symbol: string;
    underlying: string; // e.g., BTCUSDT
    strikePrice: number;
    side: OptionSide; // CALL | PUT
    expiryDate: number; // ms epoch
    unit?: number; // contract unit
    quoteAsset?: string;
}

export interface MarkPriceEntry {
    symbol: string;
    markPrice: number | null;
    bidIV?: number | null;
    askIV?: number | null;
    markIV?: number | null;
    delta?: number | null;
    theta?: number | null;
    gamma?: number | null;
    vega?: number | null;
}

const BASE_URL = "https://eapi.binance.com";

// Internal helper to coerce possibly-string numbers to number safely
const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

export const fetchExchangeInfo = async () => {
    const res = await fetch(`${BASE_URL}/eapi/v1/exchangeInfo`, {
        // cache lightly to avoid hammering the API
        next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`Binance exchangeInfo failed: ${res.status}`);
    const json = await res.json();

    // Expect json.optionSymbols: OptionSymbolInfo like
    const rawSymbols: any[] = json?.optionSymbols ?? json?.symbols ?? [];
    const symbols: OptionSymbolInfo[] = rawSymbols
        .map((s) => {
            const strike = toNum(s?.strikePrice);
            const expiry = toNum(s?.expiryDate);
            const side = s?.side as OptionSide | undefined;
            const sym = s?.symbol as string | undefined;
            const underlying = s?.underlying as string | undefined;
            if (!sym || !underlying || strike == null || expiry == null || (side !== "CALL" && side !== "PUT")) {
                return null;
            }
            return {
                symbol: sym,
                underlying,
                strikePrice: strike,
                side,
                expiryDate: expiry,
                unit: toNum(s?.unit) ?? undefined,
                quoteAsset: s?.quoteAsset ?? undefined,
            } satisfies OptionSymbolInfo;
        })
        .filter(Boolean) as OptionSymbolInfo[];

    return { symbols };
};

export const fetchAllMarkPrices = async (): Promise<MarkPriceEntry[]> => {
    // Docs: GET /eapi/v1/mark (symbol optional). Without symbol => returns all.
    const res = await fetch(`${BASE_URL}/eapi/v1/mark`, {
        next: { revalidate: 5 },
    });
    if (!res.ok) {
        console.error(`Binance mark prices fetch failed: ${res.status}`, res);
        throw new Error(`Binance mark price failed: ${res.status}`);
    }
    const json = await res.json();
    const arr: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return arr
        .map((d) => ({
            symbol: d?.symbol as string,
            markPrice: toNum(d?.markPrice),
            bidIV: toNum(d?.bidIV),
            askIV: toNum(d?.askIV),
            markIV: toNum(d?.markIV),
            delta: toNum(d?.delta),
            theta: toNum(d?.theta),
            gamma: toNum(d?.gamma),
            vega: toNum(d?.vega),
        }))
        .filter((x) => typeof x.symbol === "string");
};

export interface ContractRow {
    strike: number;
    callSymbol?: string;
    putSymbol?: string;
}

export const buildContractGrid = (
    symbols: OptionSymbolInfo[],
    underlying: string,
    expiryDate: number
): ContractRow[] => {
    const filtered = symbols.filter((s) => s.underlying === underlying && s.expiryDate === expiryDate);
    const byStrike = new Map<number, { callSymbol?: string; putSymbol?: string }>();
    for (const s of filtered) {
        const entry = byStrike.get(s.strikePrice) ?? {};
        if (s.side === "CALL") entry.callSymbol = s.symbol;
        else entry.putSymbol = s.symbol;
        byStrike.set(s.strikePrice, entry);
    }
    return Array.from(byStrike.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([strike, v]) => ({ strike, ...v }));
};

export const uniqueExpiriesForUnderlying = (symbols: OptionSymbolInfo[], underlying: string): number[] => {
    const set = new Set<number>();
    for (const s of symbols) if (s.underlying === underlying) set.add(s.expiryDate);
    return Array.from(set).sort((a, b) => a - b);
};

export const fetchIndexPrice = async (underlying: string): Promise<number> => {
    // Docs: GET /eapi/v1/index?underlying=BTCUSDT
    const url = new URL(`${BASE_URL}/eapi/v1/index`);
    url.searchParams.set("underlying", underlying);
    const res = await fetch(url.toString(), { next: { revalidate: 10 } });
    if (!res.ok) throw new Error(`Binance index failed: ${res.status}`);
    const json = await res.json();
    // Response may be { time, indexPrice } or { code,msg,data:{ indexPrice }}
    const idx = toNum(json?.indexPrice ?? json?.data?.indexPrice);
    if (idx == null) throw new Error("No indexPrice in response");
    return idx;
};

export interface OpenInterestEntry {
    symbol: string;
    sumOpenInterest: number; // contracts
    sumOpenInterestUsd?: number | null;
    timestamp?: number | null;
}

const OPEN_INTEREST_TTL_MS = 15 * 60 * 1000; // 15 minutes
const openInterestCache = new Map<
    string,
    {
        timestamp: number;
        value: Promise<OpenInterestEntry[]>;
    }
>();

export const fetchOpenInterest = async (
    underlyingAsset: string,
    expirationYyMmDd: string
): Promise<OpenInterestEntry[]> => {
    const cacheKey = `${underlyingAsset}:${expirationYyMmDd}`;
    const now = Date.now();
    const cached = openInterestCache.get(cacheKey);
    if (cached && now - cached.timestamp < OPEN_INTEREST_TTL_MS) {
        return cached.value;
    }

    // Docs: GET /eapi/v1/openInterest?underlyingAsset=ETH&expiration=221225
    const url = new URL(`${BASE_URL}/eapi/v1/openInterest`);
    url.searchParams.set("underlyingAsset", underlyingAsset);
    url.searchParams.set("expiration", expirationYyMmDd);
    const promise = (async () => {
        const res = await fetch(url.toString(), { next: { revalidate: 30 } });
        if (!res.ok) {
            // If endpoint fails or not supported, return empty gracefully
            return [];
        }
        const json = await res.json();
        const arr: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        return arr
            .map((d) => ({
                symbol: d?.symbol as string,
                sumOpenInterest: toNum(d?.sumOpenInterest) ?? 0,
                sumOpenInterestUsd: toNum(d?.sumOpenInterestUsd),
                timestamp: toNum(d?.timestamp),
            }))
            .filter((x) => typeof x.symbol === "string");
    })()
        .catch((error) => {
            openInterestCache.delete(cacheKey);
            throw error;
        });

    openInterestCache.set(cacheKey, { timestamp: now, value: promise });
    return promise;
};

// Helper: format expiryDate (ms) to YYMMDD expected by openInterest endpoint
export const formatExpiryToYyMmDd = (expiryMs: number): string => {
    const d = new Date(expiryMs);
    const yy = String(d.getUTCFullYear()).slice(-2);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
};

// Compute a simple sentiment score per expiry in [-1, 1]
// Approach: for each strike, weight near-ATM more (exp decay by distance),
// normalize call vs put mark prices at the same strike, and weight by open interest if available.
export interface ExpirySentimentPoint {
    expiry: number; // ms
    score: number; // [-1,1]
    strikesConsidered: number;
}

export const computeSentimentForExpiry = (
    grid: ContractRow[],
    markBySymbol: Map<string, number | null>,
    indexPrice: number,
    oiBySymbol?: Map<string, number>
): ExpirySentimentPoint => {
    const beta = 6; // steeper focus near ATM
    let num = 0;
    let den = 0;
    let strikes = 0;

    for (const row of grid) {
        const { strike, callSymbol, putSymbol } = row;
        const callPrice = callSymbol ? markBySymbol.get(callSymbol) ?? null : null;
        const putPrice = putSymbol ? markBySymbol.get(putSymbol) ?? null : null;
        if (callPrice == null && putPrice == null) continue;
        const rel = Math.log(strike / indexPrice);
        const wDist = Math.exp(-beta * Math.abs(rel));
        const oiW = (() => {
            const coi = callSymbol ? oiBySymbol?.get(callSymbol) ?? 0 : 0;
            const poi = putSymbol ? oiBySymbol?.get(putSymbol) ?? 0 : 0;
            return 1 + Math.log10(1 + coi + poi); // gentle OI boost
        })();

        const sum = (callPrice ?? 0) + (putPrice ?? 0);
        if (sum <= 0) continue;
        const cNorm = (callPrice ?? 0) / sum; // in [0,1]
        const pNorm = (putPrice ?? 0) / sum; // in [0,1]
        const local = cNorm - pNorm; // [-1,1]

        const w = wDist * oiW;
        num += local * w;
        den += w;
        strikes++;
    }

    const score = den > 0 ? Math.max(-1, Math.min(1, num / den)) : 0;
    // expiry is not known here; caller should set it on the plotting object
    return { expiry: 0, score, strikesConsidered: strikes };
};

// Prefer a stable IV value. Use markIV if present, else mean of bid/ask, else null.
export const preferIv = (entry?: Partial<MarkPriceEntry> | null): number | null => {
    if (!entry) return null;
    if (entry.markIV != null) return entry.markIV;
    if (entry.bidIV != null && entry.askIV != null) return (entry.bidIV + entry.askIV) / 2;
    if (entry.bidIV != null) return entry.bidIV;
    if (entry.askIV != null) return entry.askIV;
    return null;
};

export interface Rr25Point {
    rr25: number | null; // iv_call_25d - iv_put_25d (decimal)
}

export const computeRR25ForExpiry = (
    grid: ContractRow[],
    markEntriesBySymbol: Map<string, MarkPriceEntry>
): Rr25Point => {
    let bestCall: { sym: string; d: number } | null = null;
    let bestPut: { sym: string; d: number } | null = null;
    for (const row of grid) {
        if (row.callSymbol) {
            const me = markEntriesBySymbol.get(row.callSymbol);
            const delta = me?.delta ?? null;
            if (delta != null) {
                const diff = Math.abs(delta - 0.25);
                if (!bestCall || diff < bestCall.d) bestCall = { sym: row.callSymbol, d: diff };
            }
        }
        if (row.putSymbol) {
            const me = markEntriesBySymbol.get(row.putSymbol);
            const delta = me?.delta ?? null;
            if (delta != null) {
                const diff = Math.abs(delta + 0.25);
                if (!bestPut || diff < bestPut.d) bestPut = { sym: row.putSymbol, d: diff };
            }
        }
    }
    const callIv = bestCall ? preferIv(markEntriesBySymbol.get(bestCall.sym)) : null;
    const putIv = bestPut ? preferIv(markEntriesBySymbol.get(bestPut.sym)) : null;
    const rr25 = callIv != null && putIv != null ? callIv - putIv : null;
    return { rr25 };
};

export interface DealerGexPoint {
    gex: number | null; // raw aggregate gamma exposure proxy
}

export const computeDealerGexForExpiry = (
    grid: ContractRow[],
    markEntriesBySymbol: Map<string, MarkPriceEntry>,
    oiBySymbol: Map<string, number> | undefined,
    indexPrice: number,
    unitBySymbol?: Map<string, number>
): DealerGexPoint => {
    let agg = 0;
    let gotAny = false;
    const s2 = indexPrice * indexPrice;
    for (const row of grid) {
        for (const sym of [row.callSymbol, row.putSymbol]) {
            if (!sym) continue;
            const m = markEntriesBySymbol.get(sym);
            const gamma = m?.gamma ?? null;
            const oi = oiBySymbol?.get(sym) ?? 0; // contracts
            if (gamma == null) continue;
            const unit = unitBySymbol?.get(sym) ?? 1;
            // Proxy: gamma (1/S^2) * OI * unit * S^2 => dimensionless agg
            const contrib = gamma * oi * unit * s2;
            agg += contrib;
            gotAny = true;
        }
    }
    return { gex: gotAny ? agg : null };
};
