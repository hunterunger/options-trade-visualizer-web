import { Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import {
    optionAggregateSchema,
    optionContractSchema,
    optionSnapshotSchema,
} from "@/lib/options/schemas";
import type { OptionAggregate, OptionSnapshot } from "@/lib/options/types";

const SNAPSHOT_COLLECTION = "option_snapshots";
const AGGREGATE_COLLECTION = "option_snapshot_aggregates";

const normalizeNumeric = (value: unknown): number | null => {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Timestamp) {
        return value.toMillis();
    }
    if (typeof value === "string" && value.trim() === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const mapOptionContract = (symbol: Record<string, unknown>) => {
    const expiryDate = normalizeNumeric(symbol.expiryDate);
    const strikePrice = normalizeNumeric(symbol.strikePrice);
    if (expiryDate === null || strikePrice === null) {
        return null;
    }

    const candidate = {
        ...symbol,
        expiryDate,
        strikePrice,
        markPrice:
            symbol.markPrice === null || symbol.markPrice === undefined
                ? null
                : normalizeNumeric(symbol.markPrice),
        bidIV:
            symbol.bidIV === null || symbol.bidIV === undefined
                ? null
                : normalizeNumeric(symbol.bidIV),
        askIV:
            symbol.askIV === null || symbol.askIV === undefined
                ? null
                : normalizeNumeric(symbol.askIV),
        markIV:
            symbol.markIV === null || symbol.markIV === undefined
                ? null
                : normalizeNumeric(symbol.markIV),
        delta:
            symbol.delta === null || symbol.delta === undefined
                ? null
                : normalizeNumeric(symbol.delta),
        theta:
            symbol.theta === null || symbol.theta === undefined
                ? null
                : normalizeNumeric(symbol.theta),
        gamma:
            symbol.gamma === null || symbol.gamma === undefined
                ? null
                : normalizeNumeric(symbol.gamma),
        vega:
            symbol.vega === null || symbol.vega === undefined
                ? null
                : normalizeNumeric(symbol.vega),
    };

    const parsed = optionContractSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
};

const mapSnapshotData = (doc: QueryDocumentSnapshot): OptionSnapshot => {
    const data = doc.data();
    const normalized = {
        ...data,
        createdAt: normalizeNumeric(data.createdAt) ?? Date.now(),
        indexPrice: normalizeNumeric(data.indexPrice) ?? 0,
        expiries: Array.isArray(data.expiries)
            ? data.expiries
                  .map((expiry: unknown) => normalizeNumeric(expiry))
                  .filter((value: number | null): value is number => value !== null)
            : [],
        symbols: Array.isArray(data.symbols)
            ? data.symbols
                  .map((symbol: Record<string, unknown>) => mapOptionContract(symbol))
                  .filter((contract): contract is NonNullable<typeof contract> => contract !== null)
            : [],
    };

    return optionSnapshotSchema.parse(normalized);
};

const mapAggregateData = (doc: QueryDocumentSnapshot): OptionAggregate => {
    const data = doc.data();
    const normalized = {
        ...data,
        createdAt: normalizeNumeric(data.createdAt) ?? Date.now(),
        indexPrice: normalizeNumeric(data.indexPrice),
        expiries: Array.isArray(data.expiries)
            ? data.expiries.map((entry: Record<string, unknown>) => ({
                  ...entry,
                  expiry: normalizeNumeric(entry.expiry) ?? 0,
                  baseline:
                      entry.baseline === null || entry.baseline === undefined
                          ? null
                          : normalizeNumeric(entry.baseline),
                  rr25:
                      entry.rr25 === null || entry.rr25 === undefined
                          ? null
                          : normalizeNumeric(entry.rr25),
                  price:
                      entry.price === null || entry.price === undefined
                          ? null
                          : normalizeNumeric(entry.price),
                  strikesConsidered:
                      entry.strikesConsidered === null || entry.strikesConsidered === undefined
                          ? undefined
                          : normalizeNumeric(entry.strikesConsidered) ?? undefined,
              }))
            : [],
        metadata: data.metadata,
    };

    return optionAggregateSchema.parse(normalized);
};

export const getLatestOptionSnapshot = async (
    underlying: string,
): Promise<OptionSnapshot | null> => {
    const db = getDb();
    const snapshot = await db
        .collection(SNAPSHOT_COLLECTION)
        .doc(underlying)
        .collection("entries")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    return mapSnapshotData(snapshot.docs[0]);
};

export const getOptionSnapshotByTimestamp = async (
    underlying: string,
    createdAt: number,
): Promise<OptionSnapshot | null> => {
    const db = getDb();
    const doc = await db
        .collection(SNAPSHOT_COLLECTION)
        .doc(underlying)
        .collection("entries")
        .doc(String(createdAt))
        .get();

    if (!doc.exists) {
        return null;
    }

    return mapSnapshotData(doc as QueryDocumentSnapshot);
};

export const listOptionSnapshots = async (
    underlying: string,
    limit: number = 10,
): Promise<OptionSnapshot[]> => {
    const db = getDb();
    const snapshot = await db
        .collection(SNAPSHOT_COLLECTION)
        .doc(underlying)
        .collection("entries")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

    return snapshot.docs.map(mapSnapshotData);
};

export const getLatestOptionAggregate = async (
    underlying: string,
): Promise<OptionAggregate | null> => {
    const db = getDb();
    const snapshot = await db
        .collection(AGGREGATE_COLLECTION)
        .doc(underlying)
        .collection("entries")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    return mapAggregateData(snapshot.docs[0]);
};

export const listOptionAggregates = async (
    underlying: string,
    limit: number = 10,
): Promise<OptionAggregate[]> => {
    const db = getDb();
    const snapshot = await db
        .collection(AGGREGATE_COLLECTION)
        .doc(underlying)
        .collection("entries")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

    return snapshot.docs.map(mapAggregateData);
};
