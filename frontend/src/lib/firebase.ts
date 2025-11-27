import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAcu52UUBUwJYb_wNhFr14IrcsEKgEl8P4",
  authDomain: "sales-catelogue.firebaseapp.com",
  projectId: "sales-catelogue",
  storageBucket: "sales-catelogue.firebasestorage.app",
  messagingSenderId: "595821344222",
  appId: "1:595821344222:web:91fac7c9ddcff9bc7cd94f",
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.warn(
    `Firebase configuration is missing values for: ${missingKeys.join(', ')}.\n` +
      'Double-check your environment variables if authentication fails.'
  );
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
