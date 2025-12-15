// config/firebase.js
const admin = require('firebase-admin');

// Проверяем, запущены ли мы на Google App Engine
const isAppEngine = process.env.GAE_SERVICE || process.env.GAE_INSTANCE || process.env.GOOGLE_CLOUD_PROJECT;

let app;
let serviceAccount;

try {
  // Проверяем, инициализирован ли уже Firebase
  app = admin.app();
  console.log('✅ Firebase уже инициализирован');
} catch (error) {
  // Firebase не инициализирован, инициализируем
  if (isAppEngine) {
    // На Google App Engine используем Application Default Credentials
    console.log('🔧 Инициализация Firebase для Google App Engine (Application Default Credentials)');
    app = admin.initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'expense-app-1c549'
    });
    console.log('✅ Firebase инициализирован для App Engine! Проект:', app.options.projectId);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    // Для других платформ (Railway, Render, etc.) - используем переменную окружения
    console.log('🔧 Инициализация Firebase из переменной окружения');
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase инициализирован! Проект:', serviceAccount.project_id);
  } else {
    // Для локальной разработки - используем файл
    console.log('🔧 Инициализация Firebase из файла (локальная разработка)');
    try {
      serviceAccount = require('../firebase-service-key.json');
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase инициализирован! Проект:', serviceAccount.project_id);
    } catch (fileError) {
      console.error('❌ Ошибка: firebase-service-key.json не найден!');
      throw new Error('Firebase service account key не найден. Убедитесь, что файл существует или установлена переменная окружения FIREBASE_SERVICE_ACCOUNT_KEY');
    }
  }
}

const db = admin.firestore();

module.exports = { admin, db }; // Экспортируем и admin, и db