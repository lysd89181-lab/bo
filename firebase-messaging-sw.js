// ملفي — عامل الإشعارات (يستقبل الإشعارات حتى والموقع مقفول)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: "AIzaSyAPhOPjAgfGhON7ZJGiXAfNf2GFQr-LbvU",
  authDomain: "bolhia-8d9e4.firebaseapp.com",
  projectId: "bolhia-8d9e4",
  storageBucket: "bolhia-8d9e4.firebasestorage.app",
  messagingSenderId: "488563746126",
  appId: "1:488563746126:web:876cb478bf6a3aad8e2a1f"
});
firebase.messaging();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
