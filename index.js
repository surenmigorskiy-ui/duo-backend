// index.js
require('dotenv').config();
require('./config/firebase'); // <-- Первым делом запускаем Firebase!

// Проверка критических переменных окружения
console.log('=== Проверка переменных окружения ===');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'установлен' : 'НЕ УСТАНОВЛЕН!');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'установлен' : 'НЕ УСТАНОВЛЕН!');
console.log('PORT:', process.env.PORT || 8080);

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const familyRoutes = require('./routes/family');
const aiRoutes = require('./routes/ai');

const app = express();

// Настройка CORS для работы с production frontend
app.use(cors({
  origin: [
    'https://duo-frontend-indol.vercel.app',
    'https://duo-frontend-r3k39ys57-suren-migorskiys-projects.vercel.app',
    'https://expense-app-1c549.web.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
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
app.listen(PORT, () => console.log(`Backend started on ${PORT}`));