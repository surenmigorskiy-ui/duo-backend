// index.js
require('dotenv').config();
require('./config/firebase'); // <-- Первым делом запускаем Firebase!

// Проверка критических переменных окружения
console.log('=== Проверка переменных окружения ===');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'установлен' : 'НЕ УСТАНОВЛЕН!');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'установлен' : 'НЕ УСТАНОВЛЕН!');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'установлен (резервный)' : 'НЕ УСТАНОВЛЕН!');
console.log('PORT:', process.env.PORT || 8080);

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const familyRoutes = require('./routes/family');
const aiRoutes = require('./routes/ai');

const app = express();

// Настройка CORS для работы с production frontend
app.use(cors({
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (например, от мобильных приложений или Postman)
    if (!origin) return callback(null, true);
    
    // Список разрешенных доменов
    const allowedOrigins = [
      'https://duo-frontend-indol.vercel.app',
      'https://duo-frontend-r3k39ys57-suren-migorskiys-projects.vercel.app',
      'https://duo-frontend-ok6jqi1q5-suren-migorskiys-projects.vercel.app',
      'https://expense-app-1c549.web.app',
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:5173',
      'http://localhost:5174'
    ];
    
    // Проверяем, является ли origin поддоменом vercel.app (разрешаем все vercel.app домены)
    const isVercelApp = origin.includes('.vercel.app');
    
    if (allowedOrigins.indexOf(origin) !== -1 || isVercelApp) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '15mb' }));

// Главный роут для проверки здоровья сервера
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Duo Finance Backend работает!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/ai', aiRoutes);

const PORT = process.env.PORT || 8080;

// Для Railway и других платформ, которые сами управляют портом
// Локально - запускаем сервер, на production - экспортируем app
if (require.main === module) {
  // Локальная разработка
  app.listen(PORT, () => console.log(`Backend started on ${PORT}`));
} else {
  // Для Railway и других платформ
  module.exports = app;
}