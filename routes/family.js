// C:/duo-backend/routes/family.js (ЧИСТАЯ ВЕРСИЯ БЕЗ КОММЕНТАРИЕВ)

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const auth = require('../middleware/authMiddleware');

router.get('/members', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const usersSnap = await db.collection('users').where('familyId', '==', familyId).get();
    
    if (usersSnap.empty) {
      return res.status(200).json([]);
    }

    const members = usersSnap.docs.map(doc => {
        const { password, ...userData } = doc.data(); 
        return userData;
    });

    res.status(200).json(members);
  } catch (error) {
    console.error('[GET /members] Error:', error);
    res.status(500).json({ error: 'Failed to get family members' });
  }
});

router.get('/data', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const familyDoc = await db.collection('families').doc(familyId).get();

    if (!familyDoc.exists) {
      return res.status(200).json({});
    }

    res.status(200).json(familyDoc.data());
  } catch (error) {
    console.error('[GET /data] Error:', error);
    res.status(500).json({ error: 'Failed to get family data' });
  }
});

router.put('/data', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const dataToSave = req.body;

    await db.collection('families').doc(familyId).set(dataToSave, { merge: true });
    res.status(200).json({ success: true, message: 'Data saved successfully' });
  } catch (error) {
    console.error('[PUT /data] Error:', error);
    res.status(500).json({ error: 'Failed to save family data' });
  }
});

router.delete('/data', auth, async (req, res) => {
    try {
        const { familyId } = req.user;
        await db.collection('families').doc(familyId).set({
            createdAt: new Date()
        });
        res.status(200).json({ success: true, message: 'Family data reset' });
    } catch (error) {
        console.error('[DELETE /data] Error:', error);
        res.status(500).json({ error: 'Failed to reset data' });
    }
});

router.post('/invitation', auth, async (req, res) => {
    try {
        const { familyId } = req.user;
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.collection('families').doc(familyId).update({
            inviteCode,
            inviteCodeExpiresAt: expiresAt,
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const inviteLink = `${frontendUrl}/join?code=${inviteCode}`;

        res.json({ inviteLink });

    } catch (error) {
        console.error("Invitation creation error:", error);
        res.status(500).json({ error: 'Failed to create invitation' });
    }
});

router.post('/join', auth, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        const userToJoinId = req.user.id;

        if (!inviteCode) {
            return res.status(400).json({ error: 'Invite code not provided' });
        }

        const familySnap = await db.collection('families').where('inviteCode', '==', inviteCode.toUpperCase()).limit(1).get();

        if (familySnap.empty) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        const familyDoc = familySnap.docs[0];
        const familyData = familyDoc.data();

        if (familyData.inviteCodeExpiresAt && familyData.inviteCodeExpiresAt.toDate() < new Date()) {
            return res.status(400).json({ error: 'Invite code expired' });
        }

        const targetFamilyId = familyDoc.id;

        await db.collection('users').doc(userToJoinId).update({
            familyId: targetFamilyId,
        });
        
        res.json({ success: true, message: 'Successfully joined the family!' });

    } catch (error) {
        console.error("Join family error:", error);
        res.status(500).json({ error: 'Failed to join family' });
    }
});

// Массовое добавление транзакций
router.post('/transactions/bulk', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { transactions } = req.body;
    
    console.log('[POST /transactions/bulk] Получено транзакций:', transactions?.length || 0);
    
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'Массив транзакций обязателен и не должен быть пустым' });
    }

    // Валидация транзакций
    const requiredFields = ['description', 'amount', 'category', 'date', 'user', 'type'];
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      for (const field of requiredFields) {
        if (tx[field] === undefined || tx[field] === null) {
          console.error(`[POST /transactions/bulk] Транзакция ${i} не содержит поле: ${field}`, tx);
          return res.status(400).json({ error: `Транзакция ${i + 1} не содержит обязательное поле: ${field}` });
        }
      }
    }

    // Получаем текущие данные семьи
    const familyDoc = await db.collection('families').doc(familyId).get();
    const currentData = familyDoc.exists ? familyDoc.data() : {};
    const existingTransactions = currentData.transactions || [];
    
    console.log('[POST /transactions/bulk] Существующих транзакций:', existingTransactions.length);

    // Генерируем timestamp импорта для возможности отката
    const importTimestamp = Date.now();
    
    // Генерируем ID для новых транзакций с меткой импорта
    const newTransactions = transactions.map((tx, index) => ({
      ...tx,
      id: tx.id || `bulk-${importTimestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      priority: tx.priority || 'nice-to-have',
      // Убеждаемся, что дата в правильном формате ISO
      date: tx.date ? (typeof tx.date === 'string' ? tx.date : new Date(tx.date).toISOString()) : new Date().toISOString(),
      // Сохраняем метаданные импорта для возможности отката
      _importTimestamp: importTimestamp
    }));

    console.log('[POST /transactions/bulk] Новых транзакций для добавления:', newTransactions.length);
    console.log('[POST /transactions/bulk] Пример новой транзакции:', newTransactions[0]);

    // Объединяем с существующими транзакциями
    const updatedTransactions = [...newTransactions, ...existingTransactions];
    
    console.log('[POST /transactions/bulk] Всего транзакций после объединения:', updatedTransactions.length);

    // Сохраняем в базу данных
    await db.collection('families').doc(familyId).set({
      ...currentData,
      transactions: updatedTransactions
    }, { merge: true });

    console.log('[POST /transactions/bulk] Транзакции успешно сохранены в базу данных');
    
    // Проверяем, что данные действительно сохранены
    const verifyDoc = await db.collection('families').doc(familyId).get();
    const verifyData = verifyDoc.exists ? verifyDoc.data() : {};
    const verifyTransactions = verifyData.transactions || [];
    console.log('[POST /transactions/bulk] Проверка: транзакций в БД после сохранения:', verifyTransactions.length);

    res.status(200).json({ 
      success: true, 
      message: `Успешно добавлено ${newTransactions.length} транзакций`,
      added: newTransactions.length,
      importTimestamp: importTimestamp // Возвращаем timestamp для возможности отката
    });
  } catch (error) {
    console.error('[POST /transactions/bulk] Ошибка:', error);
    console.error('[POST /transactions/bulk] Stack:', error.stack);
    res.status(500).json({ error: 'Не удалось добавить транзакции' });
  }
});

// Откат последнего импорта транзакций
router.delete('/transactions/bulk/:importTimestamp', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { importTimestamp } = req.params;
    const timestamp = parseInt(importTimestamp);

    if (isNaN(timestamp)) {
      return res.status(400).json({ error: 'Неверный формат timestamp' });
    }

    console.log('[DELETE /transactions/bulk] Откат импорта с timestamp:', timestamp);

    // Получаем текущие данные семьи
    const familyDoc = await db.collection('families').doc(familyId).get();
    const currentData = familyDoc.exists ? familyDoc.data() : {};
    const existingTransactions = currentData.transactions || [];

    console.log('[DELETE /transactions/bulk] Транзакций до удаления:', existingTransactions.length);

    // Удаляем все транзакции с указанным timestamp импорта
    const filteredTransactions = existingTransactions.filter(tx => {
      // Удаляем транзакции с меткой импорта или ID начинающимся с bulk-{timestamp}
      const hasImportTimestamp = tx._importTimestamp === timestamp;
      const hasMatchingId = tx.id && tx.id.startsWith(`bulk-${timestamp}-`);
      
      if (hasImportTimestamp || hasMatchingId) {
        console.log(`[DELETE /transactions/bulk] Удаляем транзакцию:`, {
          id: tx.id,
          _importTimestamp: tx._importTimestamp,
          description: tx.description,
          hasImportTimestamp,
          hasMatchingId
        });
        return false;
      }
      return true;
    });

    const removedCount = existingTransactions.length - filteredTransactions.length;
    console.log('[DELETE /transactions/bulk] Удалено транзакций:', removedCount);
    console.log('[DELETE /transactions/bulk] Транзакций после удаления:', filteredTransactions.length);

    // Сохраняем обновленные данные
    await db.collection('families').doc(familyId).set({
      ...currentData,
      transactions: filteredTransactions
    }, { merge: true });

    res.status(200).json({ 
      success: true, 
      message: `Успешно удалено ${removedCount} транзакций из импорта`,
      removed: removedCount
    });
  } catch (error) {
    console.error('[DELETE /transactions/bulk] Ошибка:', error);
    res.status(500).json({ error: 'Не удалось откатить импорт' });
  }
});

// Удаление всех транзакций за указанный год
router.delete('/transactions/by-year/:year', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year } = req.params;
    const targetYear = parseInt(year);

    if (isNaN(targetYear)) {
      return res.status(400).json({ error: 'Неверный формат года' });
    }

    console.log(`[DELETE /transactions/by-year] Удаление транзакций за ${targetYear} год`);

    // Получаем текущие данные семьи
    const familyDoc = await db.collection('families').doc(familyId).get();
    const currentData = familyDoc.exists ? familyDoc.data() : {};
    const existingTransactions = currentData.transactions || [];

    console.log(`[DELETE /transactions/by-year] Транзакций до удаления: ${existingTransactions.length}`);

    // Удаляем все транзакции за указанный год
    const filteredTransactions = existingTransactions.filter(tx => {
      if (!tx.date) {
        return true; // Сохраняем транзакции без даты
      }

      try {
        const txDate = new Date(tx.date);
        const txYear = txDate.getFullYear();
        
        if (txYear === targetYear) {
          console.log(`[DELETE /transactions/by-year] Удаляем транзакцию:`, {
            id: tx.id,
            description: tx.description,
            date: tx.date,
            year: txYear
          });
          return false;
        }
        return true;
      } catch (error) {
        console.warn(`[DELETE /transactions/by-year] Ошибка при парсинге даты транзакции:`, tx.date, error);
        return true; // Сохраняем транзакции с некорректными датами
      }
    });

    const removedCount = existingTransactions.length - filteredTransactions.length;
    console.log(`[DELETE /transactions/by-year] Удалено транзакций: ${removedCount}`);
    console.log(`[DELETE /transactions/by-year] Транзакций после удаления: ${filteredTransactions.length}`);

    // Сохраняем обновленные данные
    await db.collection('families').doc(familyId).set({
      ...currentData,
      transactions: filteredTransactions
    }, { merge: true });

    res.status(200).json({ 
      success: true, 
      message: `Успешно удалено ${removedCount} транзакций за ${targetYear} год`,
      removed: removedCount,
      year: targetYear
    });
  } catch (error) {
    console.error('[DELETE /transactions/by-year] Ошибка:', error);
    res.status(500).json({ error: 'Не удалось удалить транзакции' });
  }
});

module.exports = router;