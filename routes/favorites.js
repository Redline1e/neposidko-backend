// routes/favorites.js
import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { favorites } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Додавання товару до улюблених
router.post("/favorites", authenticate, async (req, res, next) => {
  try {
    const { articleNumber } = req.body;
    const { userId } = req.user;

    if (!articleNumber) {
      return next(createError(400, "articleNumber обов'язковий"));
    }

    const existingFavorite = await db
      .select()
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.articleNumber, articleNumber)
        )
      )
      .limit(1);

    if (existingFavorite.length) {
      return next(createError(400, "Товар уже в улюблених"));
    }

    const [newFavorite] = await db
      .insert(favorites)
      .values({ userId, articleNumber })
      .returning();

    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(favorites)
      .where(eq(favorites.userId, userId));

    res.status(201).json({
      favorite: newFavorite,
      count: Number(countResult[0].count),
    });
  } catch (error) {
    next(createError(500, "Не вдалося додати до улюблених"));
  }
});

// Видалення товару з улюблених
router.delete(
  "/favorites/:articleNumber",
  authenticate,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const { userId } = req.user;

      const deletedFavorite = await db
        .delete(favorites)
        .where(
          and(
            eq(favorites.userId, userId),
            eq(favorites.articleNumber, articleNumber)
          )
        )
        .returning();

      if (!deletedFavorite.length) {
        return next(createError(404, "Товар не знайдено в улюблених"));
      }

      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(favorites)
        .where(eq(favorites.userId, userId));

      res.json({
        message: "Товар успішно видалено з улюблених",
        count: Number(countResult[0].count),
      });
    } catch (error) {
      next(createError(500, "Не вдалося видалити товар з улюблених"));
    }
  }
);

// Отримання кількості улюблених товарів
router.get("/favorites/count", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    res.json({ count: Number(countResult[0].count) });
  } catch (error) {
    next(createError(500, "Не вдалося отримати кількість улюблених товарів"));
  }
});

// Отримання списку улюблених товарів (опціонально, якщо потрібно)
router.get("/favorites", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const userFavorites = await db
      .select({
        articleNumber: favorites.articleNumber,
      })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    res.json(userFavorites);
  } catch (error) {
    next(createError(500, "Не вдалося отримати улюблені товари"));
  }
});

export default router;
