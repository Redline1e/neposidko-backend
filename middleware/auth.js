import jwt from "jsonwebtoken";
import createError from "http-errors";
import { db } from "../db/index.js";
import { users, roles } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next(createError(401, "Неавторизований"));

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    next(createError(401, "Недійсний токен"));
  }
};

// middleware/auth.js
export const authenticateAdmin = async (req, res, next) => {
  try {
    console.log("\n=== Новий запит ===");
    console.log("Метод:", req.method);
    console.log("URL:", req.originalUrl);
    console.log("Заголовки:", JSON.stringify(req.headers, null, 2));

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.error("Помилка: Відсутній заголовок Authorization");
      return next(createError(401, "Неавторизований"));
    }

    const [bearer, token] = authHeader.split(" ");

    if (bearer.toLowerCase() !== "bearer" || !token) {
      console.error("Помилка: Невірний формат заголовка");
      return next(createError(401, "Невірний формат токена"));
    }

    console.log("Отриманий токен:", token);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Декодований токен:", decoded);

      const user = await db.query.users.findFirst({
        where: eq(users.userId, decoded.userId),
        columns: { roleId: true },
      });

      if (!user) {
        console.error("Користувач не знайдений");
        return next(createError(404, "Користувача не знайдено"));
      }

      const role = await db.query.roles.findFirst({
        where: eq(roles.roleId, user.roleId),
      });

      console.log("Знайдена роль:", role);

      if (!role || role.name.toLowerCase() !== "admin") {
        console.error("Недостатньо прав. Роль:", role?.name);
        return next(createError(403, "Заборонено"));
      }

      req.user = { userId: decoded.userId, role: role.name };
      next();
    } catch (jwtError) {
      console.error("Помилка JWT:", jwtError);
      next(createError(401, "Недійсний токен"));
    }
  } catch (error) {
    console.error("Загальна помилка авторизації:", error);
    next(createError(500, "Внутрішня помилка сервера"));
  }
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { userId: decoded.userId };
    } catch (error) {
      // Продовжуємо як гість
    }
  }
  next();
};
