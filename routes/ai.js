// routes/ai.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Multer настроен для загрузки файлов в оперативную память
const upload = multer();

// Функция для получения экземпляра Gemini AI (создается при каждом запросе, чтобы использовать актуальный API ключ)
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY не установлен в переменных окружения');
  }
  return new GoogleGenerativeAI(apiKey);
};

// Функция для получения списка доступных моделей (для отладки)
const listAvailableModels = async () => {
  try {
    const genAI = getGenAI();
    // Используем встроенный метод для получения списка моделей
    // Примечание: это может не работать напрямую, но попробуем
    console.log('Попытка получить список доступных моделей...');
    return null; // Пока не реализовано, но можно добавить позже
  } catch (error) {
    console.error('Ошибка при получении списка моделей:', error);
    return null;
  }
};

// Распознавание чека
router.post('/parse-receipt', auth, upload.single('image'), async (req, res) => {
  try {
    const { categories } = req.body;

    const genAI = getGenAI();
      // Используем Gemini 2.5 Flash-Lite для распознавания чеков
      let model;
      try {
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        console.log('Модель gemini-2.5-flash-lite создана для распознавания чека');
      } catch (modelError) {
        console.log('Ошибка при создании gemini-2.5-flash-lite, пробуем gemini-2.5-flash:', modelError.message);
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log('Модель gemini-2.5-flash создана для распознавания чека');
      }
    const input = req.file.buffer.toString('base64');

    const result = await model.generateContent([
      { inlineData: { mimeType: req.file.mimetype, data: input } },
      `Категории: ${categories}`
    ]);

    res.json(JSON.parse(result.response.text()));
  } catch (error) {
    console.error("Ошибка в /parse-receipt:", error);
    res.status(500).json({ error: "Ошибка при анализе чека" });
  }
});

// Финансовый совет
router.post('/financial-advice', auth, async (req, res) => {
  console.log('=== Начало запроса /financial-advice ===');
  console.log('Заголовки запроса:', req.headers);
  console.log('Тело запроса получено, размер:', JSON.stringify(req.body).length);
  try {
    // Проверяем наличие API ключа и создаем экземпляр Gemini
    let genAI;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      console.log('GEMINI_API_KEY присутствует:', !!apiKey);
      console.log('GEMINI_API_KEY длина:', apiKey ? apiKey.length : 0);
      
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY не установлен');
      }
      
      genAI = getGenAI();
      console.log('Экземпляр Gemini создан успешно');
    } catch (keyError) {
      console.error("Ошибка при создании Gemini:", keyError.message);
      return res.status(500).json({ 
        error: "API ключ Gemini не настроен. Обратитесь к администратору." 
      });
    }

    console.log('Создаем модель Gemini...');
    // Используем Gemini 2.5 Flash-Lite - быстрая и эффективная модель
    // Если не сработает, пробуем Gemini 2.5 Flash
    let model;
    try {
      model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      console.log('Модель gemini-2.5-flash-lite создана');
    } catch (modelError) {
      console.log('Ошибка при создании gemini-2.5-flash-lite, пробуем gemini-2.5-flash:', modelError.message);
      try {
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log('Модель gemini-2.5-flash создана');
      } catch (flashError) {
        console.error('Ошибка при создании обеих моделей:', flashError.message);
        throw new Error(`Не удалось создать модель: ${flashError.message}`);
      }
    }

    // Ограничиваем размер данных для промпта
    const transactionsData = req.body.transactions || [];
    const budgetData = req.body.budget || {};
    
    console.log('Получено транзакций:', transactionsData.length);
    console.log('Бюджет:', JSON.stringify(budgetData).substring(0, 100));
    
    // Берем только последние 50 транзакций, чтобы не превысить лимиты
    const limitedTransactions = transactionsData.slice(-50);

    // Формируем промпт с ограничением размера
    const transactionsSummary = limitedTransactions.length > 0 
      ? `Найдено ${limitedTransactions.length} транзакций. Основные категории: ${[...new Set(limitedTransactions.map(t => t.category))].join(', ')}`
      : 'Транзакций не найдено';
    
    const prompt = `Ты финансовый консультант. Дай краткий финансовый совет на русском языке (2-3 предложения), основываясь на следующих данных:

${transactionsSummary}

Бюджет: ${JSON.stringify(budgetData)}

Совет должен быть конкретным и полезным.`;

    console.log('Отправляем запрос в Gemini...');
    console.log('Длина промпта:', prompt.length);
    console.log('Используемая модель:', model.model || 'unknown');
    
    // Если первая модель не работает, пробуем другие
    let result;
    let genError = null;
    const modelsToTry = [
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.0-flash-exp",
      "gemini-1.5-flash"
    ];
    
    // Сначала пробуем текущую модель
    try {
      result = await model.generateContent(prompt);
      console.log('Успешно использована модель:', model.model || 'unknown');
    } catch (firstError) {
      console.error("=== ОШИБКА при вызове generateContent с первой моделью ===");
      console.error("Модель:", model.model || 'unknown');
      console.error("Ошибка:", firstError.message);
      genError = firstError;
      
      // Пробуем другие модели
      for (const modelName of modelsToTry) {
        if (model.model === modelName) continue; // Пропускаем уже испробованную
        try {
          console.log(`Пробуем модель: ${modelName}`);
          const altModel = genAI.getGenerativeModel({ model: modelName });
          result = await altModel.generateContent(prompt);
          console.log(`Успешно использована модель: ${modelName}`);
          break;
        } catch (altError) {
          console.log(`Модель ${modelName} не сработала:`, altError.message);
          genError = altError;
          continue;
        }
      }
      
      // Если ни одна модель не сработала
      if (!result) {
        console.error("=== ВСЕ МОДЕЛИ НЕ СРАБОТАЛИ ===");
        console.error("Последняя ошибка:", genError?.message);
        console.error("Stack:", genError?.stack);
        if (genError?.response) {
          console.error("Response:", genError.response);
        }
        throw genError || firstError;
      }
    }
    
    const adviceText = result.response.text();
    
    console.log('Получен ответ от Gemini, длина:', adviceText.length);
    console.log('=== Успешное завершение запроса ===');

    res.json({ advice: adviceText });
  } catch (error) {
    console.error("=== ОШИБКА в /financial-advice ===");
    console.error("Тип ошибки:", error.constructor.name);
    console.error("Сообщение:", error.message);
    console.error("Stack:", error.stack);
    if (error.response) {
      console.error("Response:", error.response);
    }
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    
    // Более детальная обработка ошибок
    let errorMessage = "Ошибка при генерации совета";
    
    if (error.message && (error.message.includes('API_KEY') || error.message.includes('API key'))) {
      errorMessage = "Неверный API ключ Gemini. Проверьте настройки сервера.";
    } else if (error.message && error.message.includes('quota')) {
      errorMessage = "Превышен лимит запросов к Gemini API. Попробуйте позже.";
    } else if (error.message && error.message.includes('SAFETY')) {
      errorMessage = "Запрос был заблокирован системой безопасности. Попробуйте изменить формулировку.";
    } else if (error.message && error.message.includes('PERMISSION_DENIED')) {
      errorMessage = "Нет доступа к Gemini API. Проверьте API ключ и права доступа.";
    } else if (error.message) {
      errorMessage = `Ошибка API: ${error.message}`;
    }
    
    console.error("Возвращаем ошибку клиенту:", errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// Совет по конкретному графику
router.post('/chart-advice', auth, async (req, res) => {
  console.log('=== Начало запроса /chart-advice ===');
  try {
    // Проверяем наличие API ключа и создаем экземпляр Gemini
    let genAI;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY не установлен');
      }
      genAI = getGenAI();
      console.log('Экземпляр Gemini создан успешно');
    } catch (keyError) {
      console.error("Ошибка при создании Gemini:", keyError.message);
      return res.status(500).json({ 
        error: "API ключ Gemini не настроен. Обратитесь к администратору." 
      });
    }

    console.log('Создаем модель Gemini 2.5 Flash-Lite...');
    let model;
    try {
      model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      console.log('Модель gemini-2.5-flash-lite создана');
    } catch (modelError) {
      console.log('Ошибка при создании gemini-2.5-flash-lite, пробуем gemini-2.5-flash:', modelError.message);
      try {
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log('Модель gemini-2.5-flash создана');
      } catch (flashError) {
        console.error('Ошибка при создании моделей:', flashError.message);
        throw new Error(`Не удалось создать модель: ${flashError.message}`);
      }
    }

    const { chartType, chartTitle, data } = req.body;
    
    console.log('Тип графика:', chartType);
    console.log('Название графика:', chartTitle);
    console.log('Количество элементов данных:', data?.length || 0);
    
    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'Нет данных для анализа графика' });
    }

    // Формируем краткое описание данных графика
    const dataSummary = data.slice(0, 10).map(item => {
      if (item.name && item.value !== undefined) {
        return `${item.name}: ${typeof item.value === 'number' ? item.value.toLocaleString('ru-RU') : item.value}`;
      }
      return JSON.stringify(item);
    }).join(', ');
    
    const prompt = `Ты опытный финансовый аналитик с чувством юмора. Проанализируй следующий график и дай краткий вывод на русском языке.

Название графика: ${chartTitle}
Тип: ${chartType}

Данные: ${dataSummary}${data.length > 10 ? ` (и еще ${data.length - 10} элементов)` : ''}

ТРЕБОВАНИЯ К ОТВЕТУ:
- Максимум 4-5 предложений
- Нельзя использовать markdown (никаких звездочек, подчеркиваний, жирного текста и т.д.)
- Не использовать вводные слова и фразы (типа "кроме того", "более того", "однако", "в то же время" и т.п.)
- Не давать банальные факты (типа "следите за расходами" или "экономьте деньги")
- Делить текст на абзацы для читабельности (пустая строка между абзацами)

СТИЛЬ:
- Либо дай профессиональный, глубокий анализ с конкретными рекомендациями
- Либо скажи колючую правду с легким юмором, которая заставит задуматься

Будь остроумным, но полезным.`;

    console.log('Отправляем запрос в Gemini...');
    console.log('Длина промпта:', prompt.length);
    
    let result;
    try {
      result = await model.generateContent(prompt);
      const adviceText = result.response.text();
      
      console.log('Получен ответ от Gemini, длина:', adviceText.length);
      console.log('=== Успешное завершение запроса ===');

      res.json({ advice: adviceText });
    } catch (genError) {
      console.error("=== ОШИБКА при вызове generateContent ===");
      console.error("Ошибка:", genError.message);
      
      // Пробуем альтернативную модель
      if (model.model !== "gemini-2.5-flash") {
        try {
          console.log('Пробуем альтернативную модель: gemini-2.5-flash');
          const altModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          result = await altModel.generateContent(prompt);
          const adviceText = result.response.text();
          console.log('Успешно использована модель: gemini-2.5-flash');
          return res.json({ advice: adviceText });
        } catch (altError) {
          console.error('Альтернативная модель также не сработала:', altError.message);
        }
      }
      
      throw genError;
    }
  } catch (error) {
    console.error("=== ОШИБКА в /chart-advice ===");
    console.error("Тип ошибки:", error.constructor.name);
    console.error("Сообщение:", error.message);
    console.error("Stack:", error.stack);
    
    let errorMessage = "Ошибка при генерации совета по графику";
    
    if (error.message && (error.message.includes('API_KEY') || error.message.includes('API key'))) {
      errorMessage = "Неверный API ключ Gemini. Проверьте настройки сервера.";
    } else if (error.message && error.message.includes('quota')) {
      errorMessage = "Превышен лимит запросов к Gemini API. Попробуйте позже.";
    } else if (error.message && error.message.includes('SAFETY')) {
      errorMessage = "Запрос был заблокирован системой безопасности.";
    } else if (error.message) {
      errorMessage = `Ошибка API: ${error.message}`;
    }
    
    console.error("Возвращаем ошибку клиенту:", errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// Вспомогательная функция для анализа паттернов из истории транзакций
function analyzePatterns(transactions, description) {
  if (!transactions || transactions.length === 0) return null;
  
  // Находим похожие транзакции по ключевым словам
  const keywords = description.toLowerCase().split(/\s+/).filter(kw => kw.length > 2);
  if (keywords.length === 0) return null;
  
  const similar = transactions.filter(t => {
    const desc = (t.description || '').toLowerCase();
    return keywords.some(kw => desc.includes(kw));
  });
  
  if (similar.length === 0) return null;
  
  // Находим наиболее частые значения
  const categoryCounts = {};
  const userCounts = {};
  const paymentMethodCounts = {};
  const priorityCounts = {};
  
  similar.slice(0, 20).forEach(t => {
    if (t.category) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }
    if (t.user) {
      userCounts[t.user] = (userCounts[t.user] || 0) + 1;
    }
    if (t.paymentMethodId) {
      paymentMethodCounts[t.paymentMethodId] = (paymentMethodCounts[t.paymentMethodId] || 0) + 1;
    }
    if (t.priority) {
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
    }
  });
  
  const topCategory = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a])[0];
  const topUser = Object.keys(userCounts).sort((a, b) => userCounts[b] - userCounts[a])[0];
  const topPaymentMethod = Object.keys(paymentMethodCounts).sort((a, b) => paymentMethodCounts[b] - paymentMethodCounts[a])[0];
  const topPriority = Object.keys(priorityCounts).sort((a, b) => priorityCounts[b] - priorityCounts[a])[0];
  
  const patterns = [];
  if (topCategory && categoryCounts[topCategory] > 1) {
    patterns.push(`Категория "${topCategory}" использовалась ${categoryCounts[topCategory]} раз`);
  }
  if (topUser && userCounts[topUser] > 1) {
    patterns.push(`Пользователь "${topUser}" использовался ${userCounts[topUser]} раз`);
  }
  if (topPaymentMethod && paymentMethodCounts[topPaymentMethod] > 1) {
    patterns.push(`Способ оплаты "${topPaymentMethod}" использовался ${paymentMethodCounts[topPaymentMethod]} раз`);
  }
  if (topPriority && priorityCounts[topPriority] > 1) {
    patterns.push(`Приоритет "${topPriority}" использовался ${priorityCounts[topPriority]} раз`);
  }
  
  return patterns.length > 0 ? patterns.join('. ') : null;
}

// Автозаполнение полей при вводе описания транзакции
router.post('/autofill', auth, async (req, res) => {
  console.log('=== Начало запроса /autofill ===');
  try {
    const { description, transactionType, categories, subCategories, users, paymentMethods, recentTransactions } = req.body;
    
    if (!description || description.trim().length < 2) {
      return res.json({ 
        category: null, 
        subCategory: null, 
        user: null, 
        priority: null, 
        paymentMethodId: null,
        amount: null
      });
    }

    console.log('Описание:', description);
    console.log('Тип транзакции:', transactionType);
    console.log('Количество категорий:', categories?.length || 0);
    console.log('Количество последних транзакций:', recentTransactions?.length || 0);

    let genAI;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY не установлен');
      }
      genAI = getGenAI();
      console.log('Экземпляр Gemini создан успешно');
    } catch (keyError) {
      console.error("Ошибка при создании Gemini:", keyError.message);
      return res.status(500).json({ 
        error: "API ключ Gemini не настроен. Обратитесь к администратору." 
      });
    }

    console.log('Создаем модель Gemini 2.5 Flash-Lite...');
    let model;
    try {
      model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      console.log('Модель gemini-2.5-flash-lite создана');
    } catch (modelError) {
      console.log('Ошибка при создании gemini-2.5-flash-lite, пробуем gemini-2.5-flash:', modelError.message);
      try {
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log('Модель gemini-2.5-flash создана');
      } catch (flashError) {
        console.error('Ошибка при создании моделей:', flashError.message);
        return res.json({ category: null, subCategory: null, user: null, priority: null, paymentMethodId: null, amount: null });
      }
    }

    // Анализируем паттерны из последних транзакций
    const patterns = analyzePatterns(recentTransactions || [], description);
    
    // Формируем списки для выбора
    const categoryList = (categories || []).map(c => typeof c === 'string' ? c : c.name).join(', ');
    const userList = (users || []).join(', ');
    const paymentMethodList = (paymentMethods || []).map(pm => {
      const name = typeof pm === 'string' ? pm : pm.name;
      const owner = typeof pm === 'string' ? '' : (pm.owner || '');
      return owner ? `${name} (${owner})` : name;
    }).join(', ');
    
    const prompt = `Ты помощник для автозаполнения финансовых транзакций. 
Проанализируй описание транзакции и предложи значения из существующих списков.

Описание: "${description}"
Тип: ${transactionType === 'expense' ? 'расход' : 'доход'}

Доступные категории: ${categoryList || 'нет'}
Доступные пользователи: ${userList || 'нет'}
Доступные способы оплаты: ${paymentMethodList || 'нет'}
${transactionType === 'expense' ? 'Приоритеты: must-have, nice-to-have' : ''}

${patterns ? `Паттерны из истории транзакций:\n${patterns}` : ''}

Верни ТОЛЬКО JSON в формате:
{
  "category": "название категории из списка или null",
  "subCategory": "название подкатегории или null",
  "user": "Suren или Alena или shared или null",
  "priority": "must-have или nice-to-have или null",
  "paymentMethodId": "ID способа оплаты или null",
  "amount": число или null
}

ВАЖНО:
- Используй ТОЛЬКО значения из предоставленных списков
- Если не уверен - верни null
- Анализируй описание и паттерны для точного определения
- Для расходов учитывай приоритет (must-have для обязательных, nice-to-have для желательных)
- paymentMethodId должен быть точным ID из списка paymentMethods
- amount: попробуй извлечь сумму из описания, если она упомянута (например "500 рублей", "1000 сум"). Если суммы нет - верни null`;

    console.log('Отправляем запрос в Gemini...');
    console.log('Длина промпта:', prompt.length);
    
    let result;
    try {
      result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      console.log('Получен ответ от Gemini, длина:', responseText.length);
      
      // Парсим JSON из ответа
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        console.log('Предложения автозаполнения:', suggestions);
        console.log('=== Успешное завершение запроса ===');
        res.json(suggestions);
      } else {
        console.log('Не удалось найти JSON в ответе');
        res.json({ category: null, subCategory: null, user: null, priority: null, paymentMethodId: null, amount: null });
      }
    } catch (genError) {
      console.error("=== ОШИБКА при вызове generateContent ===");
      console.error("Ошибка:", genError.message);
      // В случае ошибки возвращаем пустые значения, чтобы не блокировать пользователя
      res.json({ category: null, subCategory: null, user: null, priority: null, paymentMethodId: null, amount: null });
    }
  } catch (error) {
    console.error("=== ОШИБКА в /autofill ===");
    console.error("Тип ошибки:", error.constructor.name);
    console.error("Сообщение:", error.message);
    // В случае ошибки возвращаем пустые значения
    res.json({ category: null, subCategory: null, user: null, priority: null, paymentMethodId: null });
  }
});

// Тестовый эндпоинт для проверки API ключа (только для разработки)
router.get('/test-key', auth, (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  res.json({
    hasKey: !!apiKey,
    keyLength: apiKey ? apiKey.length : 0,
    keyPreview: apiKey ? `${apiKey.substring(0, 10)}...` : 'не установлен'
  });
});

module.exports = router;