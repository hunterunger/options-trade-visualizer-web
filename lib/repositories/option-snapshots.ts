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

export interface SnapshotExpiryAggregate {
    expiry: number;
    baseline: number | null;
    rr25: number | null;
    price: number | null;
    strikesConsidered?: number;
}

export interface OptionSnapshotAggregateDoc {
    id: string;
    underlying: string;
    createdAt: number;
    indexPrice: number | null;
    expiries: SnapshotExpiryAggregate[];
    metadata?: {
        version: number;
        sourceSnapshotId?: string;
    };
}

const AGG_COLLECTION = "option_snapshot_aggregates";
const AGG_ENTRY_SUBCOLLECTION = "entries";

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

export const getSnapshotForUnderlyingAt = async (
    underlying: string,
    createdAt: number
): Promise<OptionSnapshotDoc | null> => {
    if (!db) return null;
    const entryRef = db
        .collection(COLLECTION)
        .doc(underlying)
        .collection(ENTRY_SUBCOLLECTION)
        .doc(String(createdAt));
    const doc = await entryRef.get();
    if (doc.exists) {
        return { id: doc.id, ...(doc.data() as Omit<OptionSnapshotDoc, "id">) };
    }

    // Legacy root-level document fallback
    try {
        const legacy = await db
            .collection(COLLECTION)
            .where("underlying", "==", underlying)
            .where("createdAt", "==", createdAt)
            .limit(1)
            .get();
        if (legacy.empty) return null;
        const legacyDoc = legacy.docs[0];
        return { id: legacyDoc.id, ...(legacyDoc.data() as Omit<OptionSnapshotDoc, "id">) };
    } catch {
        return null;
    }
};

export const listSnapshotsForUnderlying = async (
    underlying: string,
    limit = 120
): Promise<OptionSnapshotDoc[]> => {
    if (!db) return [];
    const entriesSnap = await db
        .collection(COLLECTION)
        .doc(underlying)
        .collection(ENTRY_SUBCOLLECTION)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
    const entries: OptionSnapshotDoc[] = entriesSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<OptionSnapshotDoc, "id">),
    }));

    if (entries.length > 0) {
        return entries;
    }

    // Legacy fallback if subcollection is empty
    try {
        const legacySnap = await db
            .collection(COLLECTION)
            .where("underlying", "==", underlying)
            .orderBy("createdAt", "desc")
            .limit(limit)
            .get();
        return legacySnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<OptionSnapshotDoc, "id">) }));
    } catch {
        return [];
    }
};

export interface SaveSnapshotAggregateInput extends Omit<OptionSnapshotAggregateDoc, "id"> { }

export const saveSnapshotAggregate = async (
    underlying: string,
    aggregate: SaveSnapshotAggregateInput
) => {
    if (!db) throw new Error("Firestore not initialized");
    const baseRef = db.collection(AGG_COLLECTION).doc(underlying);
    const entryRef = baseRef.collection(AGG_ENTRY_SUBCOLLECTION).doc(String(aggregate.createdAt));
    await entryRef.set({ ...aggregate });
    await baseRef.set({ latestCreatedAt: aggregate.createdAt }, { merge: true });
    return entryRef.id;
};

const mapAggregateDoc = (doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>): OptionSnapshotAggregateDoc => ({
    id: doc.id,
    ...(doc.data() as Omit<OptionSnapshotAggregateDoc, "id">),
});

export const getSnapshotAggregateAt = async (
    underlying: string,
    createdAt: number
): Promise<OptionSnapshotAggregateDoc | null> => {
    if (!db) return null;
    const entry = await db
        .collection(AGG_COLLECTION)
        .doc(underlying)
        .collection(AGG_ENTRY_SUBCOLLECTION)
        .doc(String(createdAt))
        .get();
    if (entry.exists) {
        return mapAggregateDoc(entry);
    }

    try {
        const legacy = await db
            .collection(AGG_COLLECTION)
            .where("underlying", "==", underlying)
            .where("createdAt", "==", createdAt)
            .limit(1)
            .get();
        if (legacy.empty) return null;
        return mapAggregateDoc(legacy.docs[0]);
    } catch {
        return null;
    }
};

export const getLatestSnapshotAggregate = async (
    underlying: string
): Promise<OptionSnapshotAggregateDoc | null> => {
    if (!db) return null;
    const entries = await db
        .collection(AGG_COLLECTION)
        .doc(underlying)
        .collection(AGG_ENTRY_SUBCOLLECTION)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    if (!entries.empty) {
        return mapAggregateDoc(entries.docs[0]);
    }

    try {
        const legacy = await db
            .collection(AGG_COLLECTION)
            .where("underlying", "==", underlying)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
        if (legacy.empty) return null;
        return mapAggregateDoc(legacy.docs[0]);
    } catch {
        return null;
    }
};

export const listSnapshotAggregates = async (
    underlying: string,
    limit = 120
): Promise<OptionSnapshotAggregateDoc[]> => {
    if (!db) return [];
    const entriesSnap = await db
        .collection(AGG_COLLECTION)
        .doc(underlying)
        .collection(AGG_ENTRY_SUBCOLLECTION)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
    const entries = entriesSnap.docs.map(mapAggregateDoc);
    if (entries.length > 0) {
        return entries;
    }

    try {
        const legacySnap = await db
            .collection(AGG_COLLECTION)
            .where("underlying", "==", underlying)
            .orderBy("createdAt", "desc")
            .limit(limit)
            .get();
        return legacySnap.docs.map(mapAggregateDoc);
    } catch {
        return [];
    }
};
