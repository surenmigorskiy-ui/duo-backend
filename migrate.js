// C:/duo-backend/migrate.js

const { db } = require('./config/firebase');

// --- ВАШИ ДАННЫЕ УЖЕ ВСТАВЛЕНЫ ---
const OLD_DATA_DOC_ID = 'family_suren_alena';
const NEW_FAMILY_DOC_ID = 'BgychCqPhStYUNNHUMlm';
// ---------------------------------


async function migrateData() {
  console.log('🏁 Начинаю миграцию...');

  try {
    // 1. Получаем ссылки на оба документа
    const oldDocRef = db.collection('users').doc(OLD_DATA_DOC_ID);
    const newDocRef = db.collection('families').doc(NEW_FAMILY_DOC_ID);

    // 2. Читаем все данные из старого документа
    console.log(`  - Читаю данные из 'users/${OLD_DATA_DOC_ID}'...`);
    const oldDocSnap = await oldDocRef.get();

    if (!oldDocSnap.exists) {
      throw new Error(`Не могу найти старый документ с данными! Проверьте OLD_DATA_DOC_ID: "${OLD_DATA_DOC_ID}"`);
    }

    const oldData = oldDocSnap.data();
    console.log('  - ✅ Данные успешно прочитаны.');

    // 3. Записываем все эти данные в новый документ
    console.log(`  - Записываю данные в 'families/${NEW_FAMILY_DOC_ID}'...`);
    await newDocRef.set(oldData, { merge: true }); // merge: true безопасно обновит документ
    console.log('  - ✅ Данные успешно записаны.');

    console.log('🏆 Миграция успешно завершена!');
    console.log("----------------------------------------------------");
    console.log("СЛЕДУЮЩИЙ ШАГ: Вручную удалите документ 'family_suren_alena' из коллекции 'users'.");
    console.log('Теперь вы можете остановить скрипт (Ctrl + C).');


  } catch (error) {
    console.error('💣 ОШИБКА МИГРАЦИИ:', error.message);
    process.exit(1); // Завершаем с ошибкой
  }
}

migrateData();