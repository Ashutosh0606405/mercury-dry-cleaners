const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const { getAuth } = require('firebase/auth');

// We use fallback values matching your Firebase project configuration
// to prevent startup crashes during Vercel builds or if env variables are missing.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBpHitjidcA2TKlfbmkxzew_T3MYsBuRek",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "mercury-dry-cleaners-6c752.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "mercury-dry-cleaners-6c752",
  appId: process.env.FIREBASE_APP_ID || "1:720920474006:web:17c40f455e9a584c472db7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

module.exports = {
  app,
  db,
  auth
};