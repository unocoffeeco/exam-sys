// Server-only Firebase Admin SDK. Singleton via getApps() + globalThis guard.
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

// Emulator hosts must be set BEFORE the Admin SDK is initialized.
// No protocol, host:port only.
function applyEmulatorHosts(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  }
}

function createApp(): App {
  if (USE_EMULATOR) {
    applyEmulatorHosts();
    // Emulator mode needs no service account, only a project id.
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-exam-system" });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel/CI store the key with literal \n — convert back to real newlines.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials (see .env.example)");
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

function getAdminApp(): App {
  return getApps().length > 0 ? getApp() : createApp();
}

export const adminApp = (): App => getAdminApp();
export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());
