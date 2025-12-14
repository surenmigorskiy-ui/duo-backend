// Скрипт для удаления всех транзакций за 2023 год
require('dotenv').config();
const { db } = require('./config/firebase');
const admin = require('firebase-admin');

async function deleteTransactionsByYear(year) {
  try {
    console.log(`\n=== Удаление транзакций за ${year} год ===\n`);
    
    // Получаем все семьи
    const familiesSnapshot = await db.collection('families').get();
    
    if (familiesSnapshot.empty) {
      console.log('Семьи не найдены');
      return;
    }

    let totalRemoved = 0;
    let familiesProcessed = 0;

    for (const familyDoc of familiesSnapshot.docs) {
      const familyId = familyDoc.id;
      const familyData = familyDoc.data();
      const transactions = familyData.transactions || [];

      console.log(`\nОбработка семьи ${familyId}:`);
      console.log(`  Транзакций до удаления: ${transactions.length}`);

      // Фильтруем транзакции за указанный год
      const filteredTransactions = transactions.filter(tx => {
        if (!tx.date) {
          return true; // Сохраняем транзакции без даты
        }

        try {
          const txDate = new Date(tx.date);
          const txYear = txDate.getFullYear();
          
          if (txYear === year) {
            console.log(`  Удаляем: ${tx.description || tx.id} - ${tx.date}`);
            return false;
          }
          return true;
        } catch (error) {
          console.warn(`  Ошибка при парсинге даты: ${tx.date}`);
          return true; // Сохраняем транзакции с некорректными датами
        }
      });

      const removedCount = transactions.length - filteredTransactions.length;
      
      if (removedCount > 0) {
        // Обновляем данные семьи
        await db.collection('families').doc(familyId).set({
          ...familyData,
          transactions: filteredTransactions
        }, { merge: true });

        console.log(`  Удалено транзакций: ${removedCount}`);
        console.log(`  Транзакций после удаления: ${filteredTransactions.length}`);
        
        totalRemoved += removedCount;
        familiesProcessed++;
      } else {
        console.log(`  Транзакций за ${year} год не найдено`);
      }
    }

    console.log(`\n=== Результат ===`);
    console.log(`Обработано семей: ${familiesSnapshot.size}`);
    console.log(`Семей с удаленными транзакциями: ${familiesProcessed}`);
    console.log(`Всего удалено транзакций: ${totalRemoved}`);

  } catch (error) {
    console.error('Ошибка при удалении транзакций:', error);
    throw error;
  }
}

// Запускаем удаление транзакций за 2023 год
deleteTransactionsByYear(2023)
  .then(() => {
    console.log('\n✅ Готово!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка:', error);
    process.exit(1);
  });

