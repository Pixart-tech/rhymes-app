import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyB06z-Ds_irB8KgtpDpYSXpW3aRtNMZAKE",
  authDomain: "rhymes-app-c9ec8.firebaseapp.com",
  projectId: "rhymes-app-c9ec8",
  storageBucket: "rhymes-app-c9ec8.firebasestorage.app",
  messagingSenderId: "371169155300",
  appId: "1:371169155300:web:cac5a305404f71db03f4f1",
  measurementId: "G-0189X9Q78X"
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
