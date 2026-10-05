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
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_* env vars (see .env.example)");
  }

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
