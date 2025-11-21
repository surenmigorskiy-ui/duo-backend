// C:/duo-backend/routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

router.post('/register', async (req, res) => {
  console.log('🏁 [REGISTER] Получен запрос на регистрацию...');
  try {
    // Убираем логику inviteCode отсюда. Регистрация теперь всегда создает новую семью.
    const { name, email, password, avatar } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // ...(проверки на существующего пользователя можно добавить здесь)...

    // 1. Всегда создаем новую семью для нового пользователя
    console.log('  - Создаю новую семью для нового пользователя...');
    const newFamilyRef = await db.collection('families').add({ createdAt: new Date() });
    const familyId = newFamilyRef.id;
    console.log(`  - ✅ Новая семья создана: ${familyId}`);

    // 2. Создаем самого пользователя
    const userRef = db.collection('users').doc();
    const user = {
      id: userRef.id,
      name,
      email: normalizedEmail,
      avatar: avatar || '😀',
      familyId: familyId, // Присваиваем ID новой, временной семьи
      password: await bcrypt.hash(password, 10),
    };
    
    await userRef.set(user);
    console.log('    - ✅ Пользователь записан.');

    // 3. Создаем токен и отправляем ответ
    const token = jwt.sign({ id: user.id, familyId: user.familyId }, process.env.JWT_SECRET);
    
    // Убираем пароль из объекта пользователя перед отправкой на фронтенд
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({ token, user: userWithoutPassword });

  } catch (error) {
    console.error('💣 [REGISTER] КРИТИЧЕСКАЯ ОШИБКА:', error);
    res.status(500).json({ error: 'Registration error' });
  }
});

// Код для /login остается без изменений
router.post('/login', async (req, res) => {
    console.log('=== [LOGIN] Начало запроса ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', { email: req.body?.email ? 'present' : 'missing', password: req.body?.password ? 'present' : 'missing' });
    
    try {
        const { email, password } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        
        if (!normalizedEmail) {
            console.log('[LOGIN] Ошибка: email отсутствует');
            return res.status(400).json({ error: 'Email is required' });
        }
        
        if (!password) {
            console.log('[LOGIN] Ошибка: пароль отсутствует');
            return res.status(400).json({ error: 'Password is required' });
        }
        
        console.log(`[LOGIN] Ищем пользователя с email: ${normalizedEmail}`);
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', normalizedEmail).limit(1).get();

        if (snapshot.empty) {
            console.warn(`[LOGIN] Пользователь с email ${normalizedEmail} не найден`);
            return res.status(400).json({ error: 'Неверный email или пароль' });
        }

        const userDoc = snapshot.docs[0];
        const user = userDoc.data();
        console.log(`[LOGIN] Пользователь найден: ${user.id}, проверяем пароль...`);

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.warn(`[LOGIN] Неверный пароль для email ${normalizedEmail}`);
            return res.status(400).json({ error: 'Неверный email или пароль' });
        }

        console.log('[LOGIN] Пароль верный, создаем токен...');
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('[LOGIN] КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не установлен!');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        
        const token = jwt.sign({ id: user.id, familyId: user.familyId }, jwtSecret);
        console.log('[LOGIN] Токен создан успешно');
        
        const { password: _, ...userWithoutPassword } = user;

        console.log('[LOGIN] Отправляем ответ клиенту');
        res.json({ token, user: userWithoutPassword });

    } catch (error) {
        console.error('💣 [LOGIN] ОШИБКА:', error);
        console.error('Stack:', error.stack);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        // Более информативное сообщение об ошибке
        let errorMessage = 'Login error';
        if (error.message && error.message.includes('JWT_SECRET')) {
            errorMessage = 'Server configuration error: JWT_SECRET is not set. Please contact administrator.';
        } else if (error.message) {
            errorMessage = `Login error: ${error.message}`;
        }
        
        res.status(500).json({ 
            error: errorMessage, 
            details: process.env.NODE_ENV === 'development' ? error.message : undefined 
        });
    }
});

module.exports = router;