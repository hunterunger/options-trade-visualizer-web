import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey && privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
}

if (!admin.apps.length && projectId && clientEmail && privateKey) {
    const sa: admin.ServiceAccount = { projectId, clientEmail, privateKey };
    admin.initializeApp({ credential: admin.credential.cert(sa) });
}

export const db = admin.firestore();

export const getDb = () => db;
