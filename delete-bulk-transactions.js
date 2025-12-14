// Скрипт для удаления всех массовых транзакций (bulk import)
require('dotenv').config();
const { db } = require('./config/firebase');

async function deleteBulkTransactions() {
  try {
    console.log(`\n=== Удаление всех массовых транзакций ===\n`);
    
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

      // Фильтруем массовые транзакции
      const filteredTransactions = transactions.filter(tx => {
        // Проверяем, является ли транзакция массовой
        const isBulk = tx.id?.startsWith('bulk-') || tx._importTimestamp !== undefined;
        
        if (isBulk) {
          console.log(`  Удаляем массовую транзакцию: ${tx.description || tx.id} (ID: ${tx.id})`);
          return false;
        }
        return true;
      });

      const removedCount = transactions.length - filteredTransactions.length;
      
      if (removedCount > 0) {
        // Обновляем данные семьи
        await db.collection('families').doc(familyId).set({
          ...familyData,
          transactions: filteredTransactions
        }, { merge: true });

        console.log(`  Удалено массовых транзакций: ${removedCount}`);
        console.log(`  Транзакций после удаления: ${filteredTransactions.length}`);
        
        totalRemoved += removedCount;
        familiesProcessed++;
      } else {
        console.log(`  Массовых транзакций не найдено`);
      }
    }

    console.log(`\n=== Результат ===`);
    console.log(`Обработано семей: ${familiesSnapshot.size}`);
    console.log(`Семей с удаленными транзакциями: ${familiesProcessed}`);
    console.log(`Всего удалено массовых транзакций: ${totalRemoved}`);

  } catch (error) {
    console.error('Ошибка при удалении массовых транзакций:', error);
    throw error;
  }
}

// Запускаем удаление
deleteBulkTransactions()
  .then(() => {
    console.log('\n✅ Готово!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка:', error);
    process.exit(1);
  });

