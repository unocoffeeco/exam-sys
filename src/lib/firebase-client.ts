// Client-side Firebase SDK (browser). Never import firebase-admin here.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
const AUTH_EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

type ClientBundle = { app: FirebaseApp; auth: Auth; firestore: Firestore };

// globalThis guard: HMR reloads the module, a local flag would re-connect the emulators
const globalForFirebase = globalThis as typeof globalThis & {
  __firebaseClient__?: ClientBundle;
};

function createBundle(): ClientBundle {
  // Real Firebase: every value must come from .env.local (no silent "demo-*" fallbacks).
  // Emulator mode keeps demo defaults so the old workflow still works.
  const env = (value: string | undefined, name: string, demo: string): string => {
    if (value) return value;
    if (USE_EMULATOR) return demo;
    throw new Error(`Missing ${name}. Set it in .env.local (see .env.example).`);
  };

  const config = {
    apiKey: env(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, "NEXT_PUBLIC_FIREBASE_API_KEY", "demo-api-key"),
    authDomain: env(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "demo-exam-system.firebaseapp.com"),
    projectId: env(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-exam-system"),
    messagingSenderId: env(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "123456789012"),
    appId: env(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, "NEXT_PUBLIC_FIREBASE_APP_ID", "1:123456789012:web:demo"),
  };

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  if (USE_EMULATOR) {
    const [authHost, authPort] = AUTH_EMULATOR_HOST.split(":");
    const [fsHost, fsPort] = FIRESTORE_EMULATOR_HOST.split(":");
    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, fsHost, Number(fsPort));
  }

  return { app, auth, firestore };
}

export function getFirebaseClient(): ClientBundle {
  if (!globalForFirebase.__firebaseClient__) {
    globalForFirebase.__firebaseClient__ = createBundle();
  }
  return globalForFirebase.__firebaseClient__;
}

export const getFirebaseApp = (): FirebaseApp => getFirebaseClient().app;
export const getClientAuth = (): Auth => getFirebaseClient().auth;
export const getClientFirestore = (): Firestore => getFirebaseClient().firestore;
