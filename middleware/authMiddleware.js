const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  console.log('=== Auth Middleware ===');
  console.log('URL:', req.url);
  console.log('Method:', req.method);
  console.log('Authorization header:', req.headers.authorization ? 'present' : 'missing');
  
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.log('Ошибка: токен отсутствует');
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('Токен валиден, пользователь:', decoded.id);
    next();
  } catch (error) {
    console.error('Ошибка проверки токена:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};
