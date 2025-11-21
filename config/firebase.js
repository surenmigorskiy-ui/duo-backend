// config/firebase.js
const admin = require('firebase-admin');

let serviceAccount;

// Проверяем, есть ли переменная окружения (для Railway, Render и других платформ)
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  // Для production (Railway, Render, etc.) - используем переменную окружения
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  // Для локальной разработки - используем файл
  try {
    serviceAccount = require('../firebase-service-key.json');
  } catch (error) {
    console.error('❌ Ошибка: firebase-service-key.json не найден!');
    throw new Error('Firebase service account key не найден. Убедитесь, что файл существует или установлена переменная окружения FIREBASE_SERVICE_ACCOUNT_KEY');
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log('✅ Firebase инициализирован! Проект:', serviceAccount.project_id);

const db = admin.firestore();

module.exports = { admin, db }; // Экспортируем и admin, и db