import { db } from "@/lib/firebase-admin";

const UNDERLYING = process.argv[2] ?? "BTCUSDT";
const LIMIT = Number(process.argv[3] ?? "5");

async function main() {
    if (!db) {
        console.error("Firestore not initialized");
        process.exit(1);
    }

    const snap = await db
        .collection("option_snapshot_aggregates")
        .doc(UNDERLYING)
        .collection("entries")
        .orderBy("createdAt", "desc")
        .limit(LIMIT)
        .get();

    for (const doc of snap.docs) {
        const data = doc.data();
        console.log(JSON.stringify({ createdAt: data.createdAt, expiries: data.expiries?.map((e: any) => ({ expiry: e.expiry, baseline: e.baseline, price: e.price })), metadata: data.metadata }, null, 2));
    }
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
