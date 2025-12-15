// routes/ai.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

// Multer настроен для загрузки файлов в оперативную память
const upload = multer();

// Функция для получения экземпляра OpenAI (основной провайдер)
const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('⚠️ OPENAI_API_KEY не установлен');
    return null;
  }
  try {
    return new OpenAI({ apiKey });
  } catch (error) {
    console.error('❌ Ошибка создания OpenAI клиента:', error.message);
    return null;
  }
};

// Функция для получения экземпляра Gemini AI (резервный провайдер)
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
};

// Универсальная функция для генерации текста с автоматическим переключением между провайдерами
const generateTextWithAI = async (prompt, options = {}) => {
  const { imageBase64, imageMimeType, model: preferredModel } = options;
  
  // Сначала пробуем OpenAI
  const openai = getOpenAI();
  if (openai) {
    try {
      console.log('Пробуем OpenAI...');
      
      if (imageBase64) {
        // Для изображений используем GPT-4 Vision, пробуем несколько моделей
        const openaiModels = preferredModel ? [preferredModel] : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview'];
        
        for (const modelName of openaiModels) {
          try {
            console.log(`Пробуем OpenAI модель: ${modelName}`);
            const response = await openai.chat.completions.create({
              model: modelName,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 4096
            });
            
            const text = response.choices[0]?.message?.content;
            if (text) {
              console.log(`✅ Успешно использован OpenAI (${modelName})`);
              return { text, provider: 'openai', model: modelName };
            }
          } catch (modelError) {
            console.log(`Модель ${modelName} не сработала:`, modelError.message?.substring(0, 150));
            if (modelName === openaiModels[openaiModels.length - 1]) {
              // Если это последняя модель, пробрасываем ошибку дальше
              throw modelError;
            }
            continue;
          }
        }
      } else {
        // Для текста используем GPT-4o или GPT-3.5-turbo
        const response = await openai.chat.completions.create({
          model: preferredModel || 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096
        });
        
        const text = response.choices[0]?.message?.content;
        if (text) {
          console.log('✅ Успешно использован OpenAI');
          return { text, provider: 'openai', model: preferredModel || 'gpt-4o' };
        }
      }
    } catch (openaiError) {
      const errorDetails = {
        message: openaiError.message?.substring(0, 200),
        status: openaiError.status,
        statusText: openaiError.statusText,
        code: openaiError.code,
        type: openaiError.type,
        response: openaiError.response ? {
          status: openaiError.response.status,
          statusText: openaiError.response.statusText,
          data: openaiError.response.data
        } : null
      };
      console.warn('⚠️ OpenAI ошибка:', errorDetails);
      // Продолжаем к Gemini
    }
  }
  
  // Если OpenAI не сработал, пробуем Gemini
  const genAI = getGenAI();
  if (!genAI) {
    throw new Error('Ни OpenAI, ни Gemini API ключи не установлены');
  }
  
  try {
    console.log('Пробуем Gemini...');
    const modelsToTry = [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro'
    ];
    
    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        
        if (imageBase64) {
          const result = await model.generateContent([
            { inlineData: { mimeType: imageMimeType || 'image/jpeg', data: imageBase64 } },
            prompt
          ]);
          const text = result.response.text();
          console.log(`✅ Успешно использован Gemini (${modelName})`);
          return { text, provider: 'gemini', model: modelName };
        } else {
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          console.log(`✅ Успешно использован Gemini (${modelName})`);
          return { text, provider: 'gemini', model: modelName };
        }
      } catch (modelError) {
        console.log(`Модель ${modelName} не сработала:`, modelError.message?.substring(0, 150));
        continue;
      }
    }
    
    throw new Error('Все модели Gemini не сработали');
  } catch (geminiError) {
    console.error('❌ Ошибка Gemini:', geminiError.message?.substring(0, 100));
    throw new Error(`Ошибка AI: ${geminiError.message}`);
  }
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

    const prompt = `Проанализируй это изображение чека и извлеки финансовую информацию.

Категории: ${categories}

Верни ТОЛЬКО JSON в формате:
{
  "amount": число (сумма транзакции),
  "category": "категория из списка или null",
  "date": "YYYY-MM-DD" (дата транзакции),
  "time": "HH:MM" (время транзакции из чека, если указано),
  "description": "описание транзакции"
}

ВАЖНО:
- Если дата не указана или указан только день/месяц без года, используй текущую дату (${new Date().getFullYear()} год)
- Если год не указан на чеке, ВСЕГДА используй ${new Date().getFullYear()} год (текущий год)
- Если на чеке написано "сегодня" или "today" - используй текущую дату: ${new Date().toISOString().split('T')[0]}
- time: ОБЯЗАТЕЛЬНО извлеки время транзакции из чека, если оно указано (формат HH:MM, например "14:30", "09:15")
- Если время не указано на чеке, верни null для поля time
- Верни ТОЛЬКО валидный JSON, без дополнительного текста`;

    const result = await model.generateContent([
      { inlineData: { mimeType: req.file.mimetype, data: input } },
      prompt
    ]);

    const responseText = result.response.text();
    console.log('Ответ от AI для parse-receipt:', responseText);
    
    // Парсим JSON из ответа
    let parsedResponse;
    try {
      // Пробуем найти JSON в ответе
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(responseText);
      }
      
      console.log('Распарсенные данные:', parsedResponse);
      
      // Убеждаемся, что время в правильном формате
      if (parsedResponse.time && typeof parsedResponse.time === 'string') {
        // Проверяем формат времени HH:MM
        const timeMatch = parsedResponse.time.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            parsedResponse.time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            console.log('Время нормализовано:', parsedResponse.time);
          } else {
            console.warn('Некорректное время:', parsedResponse.time);
            parsedResponse.time = null;
          }
        } else {
          console.warn('Время не в формате HH:MM:', parsedResponse.time);
          parsedResponse.time = null;
        }
      }
      
      res.json(parsedResponse);
    } catch (parseError) {
      console.error('Ошибка парсинга JSON:', parseError);
      console.error('Ответ AI:', responseText);
      res.status(500).json({ error: "Ошибка при парсинге ответа от AI" });
    }
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
      // НЕ логируем длину ключа для безопасности
      
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
  
  // Анализируем все транзакции для поиска общих паттернов
  // Находим наиболее частые значения по категориям, подкатегориям и другим полям
  const categoryCounts = {};
  const subCategoryCounts = {};
  const userCounts = {};
  const paymentMethodCounts = {};
  const priorityCounts = {};
  const descriptionPatterns = {}; // Паттерны описаний для категорий
  
  transactions.slice(0, 50).forEach(t => {
    if (t.category) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
      
      // Сохраняем паттерны описаний для категорий
      if (t.description) {
        const key = `${t.category}_${t.subCategory || 'none'}`;
        if (!descriptionPatterns[key]) {
          descriptionPatterns[key] = [];
        }
        descriptionPatterns[key].push(t.description.toLowerCase());
      }
    }
    if (t.subCategory) {
      subCategoryCounts[t.subCategory] = (subCategoryCounts[t.subCategory] || 0) + 1;
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
  const topSubCategory = Object.keys(subCategoryCounts).sort((a, b) => subCategoryCounts[b] - subCategoryCounts[a])[0];
  const topUser = Object.keys(userCounts).sort((a, b) => userCounts[b] - userCounts[a])[0];
  const topPaymentMethod = Object.keys(paymentMethodCounts).sort((a, b) => paymentMethodCounts[b] - paymentMethodCounts[a])[0];
  const topPriority = Object.keys(priorityCounts).sort((a, b) => priorityCounts[b] - priorityCounts[a])[0];
  
  const patterns = [];
  
  // Добавляем информацию о наиболее частых категориях и подкатегориях
  if (topCategory && categoryCounts[topCategory] > 2) {
    patterns.push(`Наиболее частая категория: "${topCategory}" (${categoryCounts[topCategory]} раз)`);
  }
  if (topSubCategory && subCategoryCounts[topSubCategory] > 2) {
    patterns.push(`Наиболее частая подкатегория: "${topSubCategory}" (${subCategoryCounts[topSubCategory]} раз)`);
  }
  if (topUser && userCounts[topUser] > 2) {
    patterns.push(`Наиболее частый пользователь: "${topUser}" (${userCounts[topUser]} раз)`);
  }
  if (topPaymentMethod && paymentMethodCounts[topPaymentMethod] > 2) {
    patterns.push(`Наиболее частый способ оплаты: "${topPaymentMethod}" (${paymentMethodCounts[topPaymentMethod]} раз)`);
  }
  if (topPriority && priorityCounts[topPriority] > 2) {
    patterns.push(`Наиболее частый приоритет: "${topPriority}" (${priorityCounts[topPriority]} раз)`);
  }
  
  // Добавляем примеры описаний для категорий (чтобы AI понимал паттерны)
  const patternExamples = [];
  Object.entries(descriptionPatterns).slice(0, 15).forEach(([key, descs]) => {
    const [cat, subCat] = key.split('_');
    const uniqueDescs = [...new Set(descs)].slice(0, 5);
    if (uniqueDescs.length > 0) {
      // Находим наиболее частое название для этой категории
      const descCounts = {};
      descs.forEach(desc => {
        descCounts[desc] = (descCounts[desc] || 0) + 1;
      });
      const topDesc = Object.keys(descCounts).sort((a, b) => descCounts[b] - descCounts[a])[0];
      
      patternExamples.push(`Для категории "${cat}"${subCat !== 'none' ? ` и подкатегории "${subCat}"` : ''} используются такие названия: ${uniqueDescs.join(', ')}. Наиболее частое: "${topDesc}". КРИТИЧЕСКИ ВАЖНО: если видишь похожую транзакцию - используй ТОЧНО ТАКОЕ ЖЕ название из этого списка, не придумывай новое!`);
    }
  });
  
  if (patternExamples.length > 0) {
    patterns.push(...patternExamples);
    patterns.push('ПРАВИЛО: всегда используй названия из истории транзакций, если они подходят. Не создавай новые названия!');
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

// Массовый парсинг транзакций из скриншота (несколько транзакций в одном изображении)
router.post('/parse-bulk-receipt', auth, upload.single('image'), async (req, res) => {
  try {
    // Проверяем наличие файла
    if (!req.file) {
      console.error("Ошибка: файл не загружен");
      return res.status(400).json({ error: "Файл изображения не был загружен" });
    }

    const { categories, subCategories, recentTransactions, currentUserId } = req.body;
    
    if (!categories) {
      console.error("Ошибка: категории не переданы");
      return res.status(400).json({ error: "Категории не переданы" });
    }

    let parsedCategories, parsedSubCategories, parsedRecentTransactions;
    try {
      parsedCategories = JSON.parse(categories || '[]');
      parsedSubCategories = JSON.parse(subCategories || '[]');
      parsedRecentTransactions = JSON.parse(recentTransactions || '[]');
    } catch (parseError) {
      console.error("Ошибка парсинга JSON:", parseError);
      return res.status(400).json({ error: "Неверный формат данных" });
    }

    const userId = currentUserId || null;

    // Анализируем паттерны из истории транзакций
    const patterns = analyzePatterns(parsedRecentTransactions, '');

    const input = req.file.buffer.toString('base64');
    if (!input || input.length === 0) {
      console.error("Ошибка: пустой файл");
      return res.status(400).json({ error: "Файл изображения пуст" });
    }

    // Формируем список подкатегорий по категориям
    const subCategoriesByCategory = {};
    parsedSubCategories.forEach((sc) => {
      if (!subCategoriesByCategory[sc.categoryId]) {
        subCategoriesByCategory[sc.categoryId] = [];
      }
      subCategoriesByCategory[sc.categoryId].push(sc.name);
    });

    const subCategoriesList = Object.entries(subCategoriesByCategory)
      .map(([catId, subs]) => `${catId}: ${subs.join(', ')}`)
      .join('; ');

    const prompt = `Проанализируй это изображение и найди ВСЕ финансовые транзакции (расходы и доходы).

КРИТИЧЕСКИ ВАЖНО: 
- Внимательно изучи ВСЕ элементы на изображении: списки транзакций, истории операций, выписки, чеки, уведомления
- Ищи любые упоминания сумм денег, операций, платежей, переводов
- Даже если транзакции представлены в необычном формате - попытайся их распознать
- Если видишь список операций с суммами и датами - это транзакции, которые нужно извлечь
- НЕ возвращай пустой массив, если на изображении есть хоть какие-то финансовые данные

Доступные категории: ${parsedCategories.join(', ')}
${subCategoriesList ? `Доступные подкатегории: ${subCategoriesList}` : ''}

${patterns ? `Паттерны из истории транзакций пользователя:\n${patterns}\nИспользуй эти паттерны для определения категорий и подкатегорий.` : ''}

Верни ТОЛЬКО JSON массив транзакций в формате:
[
  {
    "description": "название транзакции используя паттерны из истории",
    "amount": число (только положительные суммы расходов/доходов),
    "category": "категория из списка (ТОЧНОЕ совпадение) ИЛИ 'UNKNOWN' если назначение неясно",
    "subCategory": "подкатегория из списка или null",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" (время транзакции из скриншота),
    "type": "expense" или "income"
  }
]

ВАЖНО:
- НЕ включай транзакции с суммой 0 или отрицательной (для расходов)
- НЕ включай бонусные баллы, кешбек, начисления бонусов - это НЕ расходы
- Найди ВСЕ реальные транзакции на изображении (исключая бонусы и нулевые суммы)
- description: КРИТИЧЕСКИ ВАЖНО - используй паттерны из истории транзакций. Если в истории есть похожие транзакции - используй ТОЧНО ТАКОЕ ЖЕ название как в истории. 
  * Для такси: НЕ указывай тип такси (Комфорт, Эконом). Указывай "Такси" и адрес заказа (откуда выехал). Если адрес - ул. Махтумкули, то это "от офиса". Если другой адрес - используй его или опиши откуда (например "от метро", "с работы"). Формат: "Такси от [адрес]" или "Такси с [место]" (например "Такси от офиса", "Такси с работы"). Если есть информация куда ехал - добавь (например "Такси от офиса до дома")
  * Используй названия из паттернов - они показывают как пользователь называет эти транзакции
- time: ОБЯЗАТЕЛЬНО извлеки время транзакции из скриншота (формат HH:MM, например "05:00", "14:30")
- Если дата не указана или указан только день/месяц без года, используй текущую дату (${new Date().getFullYear()} год)
- Если год не указан на изображении, ВСЕГДА используй ${new Date().getFullYear()} год (текущий год)
- Если на изображении написано "сегодня", "today", "сейчас" или "now" - ВСЕГДА используй текущую дату: ${new Date().toISOString().split('T')[0]} (сегодня ${new Date().getDate()}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${new Date().getFullYear()})
- Если на изображении написано "сегодня", "today", "сейчас" или "now" - ВСЕГДА используй текущую дату: ${new Date().toISOString().split('T')[0]} (сегодня ${new Date().getDate()}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${new Date().getFullYear()})
- Определи тип (expense/income) по контексту
- category: КРИТИЧЕСКИ ВАЖНО - используй ТОЛЬКО точные названия из списка категорий ИЛИ "UNKNOWN".
  * ГЛАВНОЕ ПРАВИЛО: Если в описании транзакции есть только банковские термины (UZUMBANK, UZCARD, VISA, "to", перевод) БЕЗ указания товара/услуги/назначения - ВСЕГДА верни "UNKNOWN"
  * Примеры ОБЯЗАТЕЛЬНО вернуть "UNKNOWN":
    - "UZUMBANK VISAUZUM to UZCARD>uzumbank. UZ" → "UNKNOWN" (только банки, нет назначения)
    - "UZUMBANK to UZCARD" → "UNKNOWN" (перевод между счетами, назначение неясно)
    - Любое описание с "to", "transfer", "перевод" без указания ЗА ЧТО → "UNKNOWN"
    - Описание содержит только названия банков/карт без товара/услуги → "UNKNOWN"
  * Используй категории из списка ТОЛЬКО если в описании ЕСТЬ понятная информация о товаре/услуге:
    - "Продукты в магазине", "Обед в кафе", "Пицца" → "Еда"
    - "Такси от офиса", "Yandex Go" → "Транспорт"
    - Название магазина + что купили → соответствующая категория
  * НЕ угадывай категорию по сумме или времени - если нет понятного назначения в описании, верни "UNKNOWN"
  * НЕ используй "Другое" для неопределенных - используй "UNKNOWN"
- subCategory: используй ТОЛЬКО подкатегории из списка для выбранной категории. Если категория "UNKNOWN" или подкатегории нет в списке - верни null
- Анализируй паттерны из истории: если похожие транзакции использовали определенную категорию/подкатегорию/название - используй ТЕ ЖЕ значения
- Проверь на дубликаты: если видишь две одинаковые транзакции (одинаковая сумма, категория, время) - включи только одну
- Верни ТОЛЬКО валидный JSON массив, без дополнительного текста`;

    console.log("Отправка запроса к AI для анализа изображения...");
    console.log("Размер изображения (base64):", input.length, "символов");
    console.log("MIME тип:", req.file.mimetype || 'image/jpeg');
    
    // Используем универсальную функцию с автоматическим переключением между провайдерами
    let aiResult;
    try {
      console.log('🔍 Проверка API ключей:');
      console.log('  - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'установлен' : 'НЕ установлен');
      console.log('  - GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'установлен' : 'НЕ установлен');
      
      aiResult = await generateTextWithAI(prompt, {
        imageBase64: input,
        imageMimeType: req.file.mimetype || 'image/jpeg'
      });
      console.log(`✅ Использован провайдер: ${aiResult.provider}, модель: ${aiResult.model}`);
    } catch (aiError) {
      console.error("❌ Ошибка при вызове AI:", aiError.message);
      console.error("❌ Детали ошибки:", {
        name: aiError.name,
        stack: aiError.stack?.substring(0, 500)
      });
      return res.status(500).json({ 
        error: `Ошибка при анализе изображения: ${aiError.message}`,
        details: process.env.NODE_ENV === 'development' ? aiError.stack : undefined
      });
    }

    const responseText = aiResult.text;
    console.log("✅ Ответ от AI получен, длина:", responseText?.length || 0);
    console.log("📝 Провайдер:", aiResult.provider, "Модель:", aiResult.model);
    
    // Логируем первые 500 символов ответа для диагностики
    if (responseText) {
      console.log("📄 Начало ответа AI (первые 500 символов):", responseText.substring(0, 500));
    }
    
    if (!responseText) {
      console.error("❌ Ошибка: пустой текст в ответе от AI");
      return res.status(500).json({ error: "Пустой ответ от AI" });
    }

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      try {
        const transactions = JSON.parse(jsonMatch[0]);
        console.log("✅ Успешно распарсено транзакций:", transactions?.length || 0);
        
        if (transactions && transactions.length > 0) {
          console.log("📋 Примеры транзакций:", transactions.slice(0, 3).map(tx => ({
            description: tx.description?.substring(0, 50),
            amount: tx.amount,
            category: tx.category,
            date: tx.date
          })));
        } else {
          console.warn("⚠️ AI вернул пустой массив транзакций. Возможные причины:");
          console.warn("  - На изображении нет финансовых операций");
          console.warn("  - Изображение нечеткое или повреждено");
          console.warn("  - AI не смог распознать формат транзакций");
          console.warn("  - AI не понял инструкцию или вернул неверный формат");
          console.warn("📄 Полный ответ AI (первые 2000 символов):", responseText.substring(0, 2000));
          console.warn("📄 Полный ответ AI (последние 500 символов):", responseText.substring(Math.max(0, responseText.length - 500)));
          
          // Проверяем, может быть AI вернул текст вместо JSON
          if (!responseText.includes('[') && !responseText.includes('{')) {
            console.error("❌ AI вернул текст без JSON структуры!");
            console.error("❌ Это может означать, что AI не понял инструкцию или изображение не содержит транзакций");
          }
        }
        
        res.json({ transactions });
      } catch (parseError) {
        console.error("❌ Ошибка парсинга JSON из ответа AI:", parseError);
        console.error("❌ Ответ AI (первые 1000 символов):", responseText.substring(0, 1000));
        return res.status(500).json({ error: `Ошибка парсинга ответа от AI: ${parseError.message}` });
      }
    } else {
      console.error("❌ Ошибка: не найден JSON массив в ответе AI");
      console.error("❌ Ответ AI (первые 2000 символов):", responseText.substring(0, 2000));
      console.error("❌ Полный ответ AI (длина):", responseText.length, "символов");
      
      // Проверяем, может быть AI вернул объяснение вместо JSON
      const lowerResponse = responseText.toLowerCase();
      if (lowerResponse.includes('не найдено') || lowerResponse.includes('не найдены') || 
          lowerResponse.includes('нет транзакций') || lowerResponse.includes('no transactions') ||
          lowerResponse.includes('не вижу') || lowerResponse.includes('не могу найти')) {
        console.warn("⚠️ AI сообщил, что не нашел транзакции на изображении");
        // Возвращаем пустой массив, это валидный ответ
        return res.json({ transactions: [] });
      }
      
      // Если это не объяснение, а реальная ошибка парсинга
      return res.status(500).json({ 
        error: 'Не удалось распарсить ответ от AI. Ответ не содержит JSON массив.',
        details: process.env.NODE_ENV === 'development' ? responseText.substring(0, 500) : undefined
      });
    }
  } catch (error) {
    console.error("Ошибка в /parse-bulk-receipt:", error);
    console.error("Детали ошибки:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      error: "Ошибка при анализе изображения",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Парсинг транзакций из аудио
router.post('/parse-audio', auth, upload.single('audio'), async (req, res) => {
  try {
    const { categories, subCategories, recentTransactions, currentUserId } = req.body;
    const parsedCategories = JSON.parse(categories || '[]');
    const parsedSubCategories = JSON.parse(subCategories || '[]');
    const parsedRecentTransactions = JSON.parse(recentTransactions || '[]');
    const userId = currentUserId || null;

    // Анализируем паттерны из истории транзакций
    const patterns = analyzePatterns(parsedRecentTransactions, '');

    const genAI = getGenAI();
    let model;
    try {
      // Gemini поддерживает аудио через gemini-1.5-pro или gemini-2.0-flash-exp
      model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    } catch (modelError) {
      try {
        model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      } catch (proError) {
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      }
    }

    const audioBuffer = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'audio/webm';

    // Формируем список подкатегорий по категориям
    const subCategoriesByCategory = {};
    parsedSubCategories.forEach((sc) => {
      if (!subCategoriesByCategory[sc.categoryId]) {
        subCategoriesByCategory[sc.categoryId] = [];
      }
      subCategoriesByCategory[sc.categoryId].push(sc.name);
    });

    const subCategoriesList = Object.entries(subCategoriesByCategory)
      .map(([catId, subs]) => `${catId}: ${subs.join(', ')}`)
      .join('; ');

    const prompt = `Ты услышал голосовую заметку о финансовых транзакциях. Извлеки ВСЕ транзакции из аудио.

Доступные категории: ${parsedCategories.join(', ')}
${subCategoriesList ? `Доступные подкатегории: ${subCategoriesList}` : ''}

${patterns ? `Паттерны из истории транзакций пользователя:\n${patterns}\nИспользуй эти паттерны для определения категорий и подкатегорий.` : ''}

Верни ТОЛЬКО JSON массив транзакций в формате:
[
  {
    "description": "название транзакции используя паттерны из истории",
    "amount": число (только положительные суммы расходов/доходов),
    "category": "категория из списка (ТОЧНОЕ совпадение)",
    "subCategory": "подкатегория из списка или null",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" (если время упомянуто в аудио),
    "type": "expense" или "income"
  }
]

ВАЖНО:
- НЕ включай транзакции с суммой 0 или отрицательной (для расходов)
- НЕ включай бонусные баллы, кешбек, начисления бонусов - это НЕ расходы
- Найди ВСЕ реальные транзакции из аудио (исключая бонусы и нулевые суммы)
- description: КРИТИЧЕСКИ ВАЖНО - используй паттерны из истории транзакций. Если в истории есть похожие транзакции - используй ТОЧНО ТАКОЕ ЖЕ название как в истории.
  * Для такси: НЕ указывай тип такси (Комфорт, Эконом). Указывай "Такси" и адрес заказа (откуда выехал). Если адрес - ул. Махтумкули, то это "от офиса". Если другой адрес - используй его или опиши откуда (например "от метро", "с работы"). Формат: "Такси от [адрес]" или "Такси с [место]" (например "Такси от офиса", "Такси с работы"). Если есть информация куда ехал - добавь (например "Такси от офиса до дома")
  * Используй названия из паттернов - они показывают как пользователь называет эти транзакции
- time: если время упомянуто в аудио, извлеки его (формат HH:MM)
- Если дата не указана или указан только день/месяц без года, используй текущую дату (${new Date().getFullYear()} год)
- Если год не указан, ВСЕГДА используй ${new Date().getFullYear()} год (текущий год)
- Определи тип по контексту (покупка = expense, зарплата = income)
- category: КРИТИЧЕСКИ ВАЖНО - используй ТОЛЬКО точные названия из списка категорий ИЛИ "UNKNOWN".
  * ГЛАВНОЕ ПРАВИЛО: Если в описании транзакции есть только банковские термины (UZUMBANK, UZCARD, VISA, "to", перевод) БЕЗ указания товара/услуги/назначения - ВСЕГДА верни "UNKNOWN"
  * Примеры ОБЯЗАТЕЛЬНО вернуть "UNKNOWN":
    - "UZUMBANK VISAUZUM to UZCARD>uzumbank. UZ" → "UNKNOWN" (только банки, нет назначения)
    - "UZUMBANK to UZCARD" → "UNKNOWN" (перевод между счетами, назначение неясно)
    - Любое описание с "to", "transfer", "перевод" без указания ЗА ЧТО → "UNKNOWN"
    - Описание содержит только названия банков/карт без товара/услуги → "UNKNOWN"
  * Используй категории из списка ТОЛЬКО если в описании ЕСТЬ понятная информация о товаре/услуге:
    - "Продукты в магазине", "Обед в кафе", "Пицца" → "Еда"
    - "Такси от офиса", "Yandex Go" → "Транспорт"
    - Название магазина + что купили → соответствующая категория
  * НЕ угадывай категорию по сумме или времени - если нет понятного назначения в описании, верни "UNKNOWN"
  * НЕ используй "Другое" для неопределенных - используй "UNKNOWN"
- subCategory: используй ТОЛЬКО подкатегории из списка для выбранной категории. Если категория "UNKNOWN" или подкатегории нет в списке - верни null
- Анализируй паттерны из истории: если похожие транзакции использовали определенную категорию/подкатегорию/название - используй ТЕ ЖЕ значения
- Проверь на дубликаты: если видишь две одинаковые транзакции (одинаковая сумма, категория, время) - включи только одну
- Верни ТОЛЬКО валидный JSON массив, без дополнительного текста`;

    // Пробуем использовать модель с обработкой ошибок квоты
    const modelsToTryAudio = [
      "gemini-2.0-flash-exp",
      "gemini-1.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite"
    ];
    
    let result;
    let lastError = null;
    let isQuotaError = false;
    let isNotFoundError = false;
    
    // Пробуем использовать текущую модель
    try {
      result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: audioBuffer
          }
        },
        prompt
      ]);
      console.log("Запрос к AI выполнен успешно с моделью:", model.model || 'unknown');
    } catch (generateError) {
      lastError = generateError;
      console.error("Ошибка при вызове generateContent с моделью", model.model || 'unknown');
      console.error("Ошибка:", generateError.message);
      
      // Если ошибка квоты (429) или модель не найдена (404), пробуем другие модели
      const errorStatus = generateError.status || generateError.statusCode || generateError.code;
      const errorMessage = (generateError.message || '').toLowerCase();
      
      isQuotaError = errorStatus === 429 || 
                     errorStatus === '429' ||
                     errorMessage.includes('429') || 
                     errorMessage.includes('quota exceeded') ||
                     errorMessage.includes('quota') ||
                     errorMessage.includes('rate limit') ||
                     errorMessage.includes('too many requests') || false;
      
      isNotFoundError = errorStatus === 404 || 
                        errorStatus === '404' ||
                        errorMessage.includes('404') || 
                        errorMessage.includes('not found') ||
                        errorMessage.includes('is not found') ||
                        errorMessage.includes('model not found') || false;
      
      if (isQuotaError || isNotFoundError) {
        const errorType = isQuotaError ? 'квоты' : 'модель не найдена';
        console.log(`Обнаружена ошибка ${errorType}, пробуем другие модели...`);
        
        // Пробуем другие модели, исключая ту, что уже использовали
        const currentModelName = model.model || '';
        const alternativeModels = modelsToTryAudio.filter(m => m !== currentModelName);
        
        for (const altModelName of alternativeModels) {
          try {
            console.log(`Пробуем модель: ${altModelName}`);
            const altModel = genAI.getGenerativeModel({ model: altModelName });
            result = await altModel.generateContent([
              {
                inlineData: {
                  mimeType: mimeType,
                  data: audioBuffer
                }
              },
              prompt
            ]);
            console.log(`Успешно использована модель: ${altModelName}`);
            break;
          } catch (altError) {
            console.log(`Модель ${altModelName} также не сработала:`, altError.message);
            lastError = altError;
            continue;
          }
        }
      }
      
      // Если все модели не сработали
      if (!result) {
        console.error("Все модели не сработали. Последняя ошибка:", lastError?.message);
        let errorMessage;
        if (isQuotaError) {
          errorMessage = "Превышена квота API. Попробуйте позже или проверьте лимиты в Google AI Studio.";
        } else if (isNotFoundError) {
          errorMessage = "Модель AI недоступна. Система попробовала все доступные модели.";
        } else {
          errorMessage = `Ошибка при анализе аудио: ${lastError?.message}`;
        }
        return res.status(500).json({ 
          error: errorMessage,
          details: process.env.NODE_ENV === 'development' ? lastError?.stack : undefined
        });
      }
    }

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const transactions = JSON.parse(jsonMatch[0]);
      res.json({ transactions });
    } else {
      throw new Error('Не удалось распарсить ответ от AI');
    }
  } catch (error) {
    console.error("Ошибка в /parse-audio:", error);
    res.status(500).json({ error: "Ошибка при анализе аудио" });
  }
});

// Тестовый эндпоинт для проверки API ключей (только для разработки, не раскрывает ключи)
router.get('/test-key', auth, (req, res) => {
  res.json({
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    // НЕ раскрываем ключи в ответе для безопасности
  });
});

module.exports = router;