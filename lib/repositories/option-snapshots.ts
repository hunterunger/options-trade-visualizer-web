import { db } from "@/lib/firebase-admin";

export interface SnapshotSymbolEntry {
    symbol: string;
    underlying: string;
    expiryDate: number;
    strikePrice: number;
    side: "CALL" | "PUT";
    unit?: number;
    markPrice: number | null;
    bidIV?: number | null;
    askIV?: number | null;
    markIV?: number | null;
    delta?: number | null;
    theta?: number | null;
    gamma?: number | null;
    vega?: number | null;
}

export interface OptionSnapshotDoc {
    id: string; // doc id
    underlying: string;
    createdAt: number; // ms
    indexPrice: number;
    expiries: number[];
    symbols: SnapshotSymbolEntry[]; // filtered to this underlying
}

const COLLECTION = "option_snapshots";
const ENTRY_SUBCOLLECTION = "entries";

export const saveOptionSnapshot = async (doc: Omit<OptionSnapshotDoc, "id">) => {
    if (!db) throw new Error("Firestore not initialized");
    const baseRef = db.collection(COLLECTION).doc(doc.underlying);
    const entryRef = baseRef.collection(ENTRY_SUBCOLLECTION).doc(String(doc.createdAt));
    await entryRef.set({ ...doc });
    // Keep a pointer to the latest snapshot for quick metadata reads (not strictly required for retrieval)
    await baseRef.set({ latestCreatedAt: doc.createdAt }, { merge: true });
    return entryRef.id;
};

export const getLatestSnapshotForUnderlying = async (
    underlying: string
): Promise<OptionSnapshotDoc | null> => {
    if (!db) return null;
    const entries = await db
        .collection(COLLECTION)
        .doc(underlying)
        .collection(ENTRY_SUBCOLLECTION)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    if (!entries.empty) {
        const doc = entries.docs[0];
        return { id: doc.id, ...(doc.data() as Omit<OptionSnapshotDoc, "id">) };
    }

    // Legacy fallback for early snapshots stored at the root collection (requires composite index unless filtered count is tiny)
    try {
        const legacy = await db
            .collection(COLLECTION)
            .where("underlying", "==", underlying)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
        if (legacy.empty) return null;
        const doc = legacy.docs[0];
        return { id: doc.id, ...(doc.data() as Omit<OptionSnapshotDoc, "id">) };
    } catch {
        return null;
    }
};
