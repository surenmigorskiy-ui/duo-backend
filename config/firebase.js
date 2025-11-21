// config/firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-key.json'); // Путь изменился!

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log('✅ Firebase инициализирован! Проект:', serviceAccount.project_id);

const db = admin.firestore();

module.exports = { admin, db }; // Экспортируем и admin, и db