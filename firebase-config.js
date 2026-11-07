import { initializeApp } from './app/js/lib/firebase-app.js';
import { getAuth } from './app/js/lib/firebase-auth.js';
import { getFirestore } from './app/js/lib/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCSE5dF8dMmyizXWfFYyo-xHeCZLuYRtbA",
  authDomain: "qmt-extension.firebaseapp.com",
  projectId: "qmt-extension",
  storageBucket: "qmt-extension.firebasestorage.app",
  messagingSenderId: "825912701716",
  appId: "1:825912701716:web:158d752693bdd2a7f14801"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);