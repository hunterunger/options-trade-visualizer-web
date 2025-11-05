import { db } from "@/lib/firebase-admin";
import { buildSnapshotAggregate } from "@/lib/aggregations/option-snapshot";
import {
    getSnapshotAggregateAt,
    saveSnapshotAggregate,
    type OptionSnapshotDoc,
    type SaveSnapshotAggregateInput,
} from "@/lib/repositories/option-snapshots";

const SNAPSHOT_COLLECTION = "option_snapshots";
const ENTRY_SUBCOLLECTION = "entries";

interface SnapshotDocWithId extends OptionSnapshotDoc { }

const mapSnapshotDoc = (
    doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): SnapshotDocWithId => ({
    id: doc.id,
    ...(doc.data() as Omit<OptionSnapshotDoc, "id">),
});

export interface AggregateBackfillOptions {
    underlying?: string;
    limit?: number;
    force?: boolean;
    dryRun?: boolean;
}

export interface AggregateBackfillLogger {
    info?: (message: string) => void;
}

export interface AggregateBackfillResult {
    underlying: string;
    processed: number;
    created: number;
    skipped: number;
}

const emit = (logger: AggregateBackfillLogger | undefined, message: string) => {
    logger?.info?.(message);
};

const processSnapshot = async (
    underlying: string,
    snapshotDoc: SnapshotDocWithId,
    options: AggregateBackfillOptions,
    logger?: AggregateBackfillLogger
): Promise<"created" | "skipped"> => {
    if (!options.force) {
        const existing = await getSnapshotAggregateAt(underlying, snapshotDoc.createdAt);
        if (existing) {
            emit(logger, `• Skipping ${underlying} @ ${snapshotDoc.createdAt} (aggregate already exists)`);
            return "skipped";
        }
    }

    const aggregate: SaveSnapshotAggregateInput = buildSnapshotAggregate(snapshotDoc);

    if (options.dryRun) {
        emit(logger, `• [dry-run] Would upsert aggregate for ${underlying} @ ${snapshotDoc.createdAt}`);
        return "created";
    }

    await saveSnapshotAggregate(underlying, aggregate);
    emit(logger, `• Wrote aggregate for ${underlying} @ ${snapshotDoc.createdAt}`);
    return "created";
};

const backfillUnderlying = async (
    underlying: string,
    options: AggregateBackfillOptions,
    logger?: AggregateBackfillLogger
): Promise<AggregateBackfillResult> => {
    if (!db) {
        throw new Error("Firestore not initialised; set FIREBASE_* environment variables");
    }

    emit(logger, `→ Processing ${underlying}`);

    const baseRef = db.collection(SNAPSHOT_COLLECTION).doc(underlying);
    const batchSize = 200;
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined;
    let remaining = options.limit ?? Number.POSITIVE_INFINITY;

    while (remaining > 0) {
        let query = baseRef.collection(ENTRY_SUBCOLLECTION).orderBy("createdAt", "desc").limit(Math.min(batchSize, remaining));
        if (cursor) {
            query = query.startAfter(cursor);
        }
        const snap = await query.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
            const snapshotDoc = mapSnapshotDoc(doc);
            const outcome = await processSnapshot(underlying, snapshotDoc, options, logger);
            processed += 1;
            if (outcome === "created") {
                created += 1;
            } else {
                skipped += 1;
            }
            remaining -= 1;
            if (remaining <= 0) break;
        }

        cursor = snap.docs[snap.docs.length - 1];
    }

    emit(logger, `← Completed ${underlying}: processed=${processed}, created=${created}, skipped=${skipped}`);

    return { underlying, processed, created, skipped };
};

export const runAggregateBackfill = async (
    options: AggregateBackfillOptions,
    logger?: AggregateBackfillLogger
): Promise<AggregateBackfillResult[]> => {
    if (!db) {
        throw new Error("Firestore not initialised; set FIREBASE_* environment variables");
    }

    const targets: string[] = [];
    if (options.underlying) {
        targets.push(options.underlying.toUpperCase());
    } else {
        const docs = await db.collection(SNAPSHOT_COLLECTION).listDocuments();
        targets.push(...docs.map((doc) => doc.id));
    }

    const results: AggregateBackfillResult[] = [];
    for (const underlying of targets) {
        const result = await backfillUnderlying(underlying, options, logger);
        results.push(result);
    }

    emit(logger, "Backfill complete");
    return results;
};
