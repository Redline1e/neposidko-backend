import jwt from "jsonwebtoken";
import createError from "http-errors";
import { db } from "../db/index.js";
import { users, roles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { fetchOne } from "../utils.js";

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

export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next(createError(401, "Неавторизований"));

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await fetchOne(
      db
        .select({ roleId: users.roleId })
        .from(users)
        .where(eq(users.userId, decoded.userId))
        .limit(1)
    );
    if (!user) return next(createError(404, "Користувача не знайдено"));

    const role = await fetchOne(
      db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.roleId, user.roleId))
        .limit(1)
    );
    if (role.name !== "admin") return next(createError(403, "Заборонено"));

    req.user = { userId: decoded.userId, role: role.name };
    next();
  } catch (error) {
    next(createError(401, "Недійсний токен"));
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
