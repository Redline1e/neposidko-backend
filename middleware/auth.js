import jwt from "jsonwebtoken";

// Middleware для перевірки токену
export const authenticate = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Додаємо підтримку Bearer-токенів
  if (!token) {
    return res.status(403).json({ error: "Токен відсутній" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Невірний токен" });
    }
    req.user = decoded;
    next();
  });
};
