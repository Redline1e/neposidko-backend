import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { reviews, products } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { fetchOne } from "../utils.js";

const router = express.Router();

// Функція для валідації UUID (простий RegExp для типового формату)
const isValidUUID = (id) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof id === "string" && uuidRegex.test(id);
};

// Створення нового відгуку
router.post("/reviews", authenticate, async (req, res, next) => {
  try {
    const { articleNumber, rating, comment } = req.body;

    if (!articleNumber || rating === undefined || comment === undefined) {
      return next(createError(400, "Усі поля обов'язкові"));
    }
    if (rating < 1 || rating > 5) {
      return next(createError(400, "Рейтинг має бути від 1 до 5"));
    }

    // Перевірка існування товару
    const product = await fetchOne(
      db
        .select()
        .from(products)
        .where(eq(products.articleNumber, articleNumber))
        .limit(1)
    );
    if (!product) {
      return next(
        createError(404, "Товар не знайдено, відгук створити неможливо")
      );
    }

    // Переконуємося, що req.user.userId встановлено і є валідним UUID
    const userId = req.user && req.user.userId;
    if (!isValidUUID(userId)) {
      return next(createError(400, "Невірний ідентифікатор користувача"));
    }

    // Перевірка, чи користувач уже залишив відгук для даного товару
    const existingUserReview = await fetchOne(
      db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.articleNumber, articleNumber),
            eq(reviews.userId, userId)
          )
        )
        .limit(1)
    );
    if (existingUserReview) {
      return next(createError(400, "Ви вже залишили відгук для цього товару"));
    }

    const reviewDate = new Date().toISOString();
    const [newReview] = await db
      .insert(reviews)
      .values({
        userId, // Використовуємо перевірений валідний UUID-рядок
        articleNumber,
        rating,
        comment,
        reviewDate,
      })
      .returning();

    res.status(201).json(newReview);
  } catch (error) {
    console.error("Error creating review:", error);
    next(createError(500, "Не вдалося створити відгук"));
  }
});

// Отримання відгуків за articleNumber
router.get("/reviews/:articleNumber", async (req, res, next) => {
  try {
    const { articleNumber } = req.params;
    const productReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.articleNumber, articleNumber))
      .orderBy(reviews.reviewDate, "desc");
    res.json(productReviews);
  } catch (error) {
    next(createError(500, "Не вдалося отримати відгуки"));
  }
});

// Оновлення відгуку
router.put("/reviews/:reviewId", authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    if (rating === undefined || comment === undefined) {
      return next(createError(400, "Усі поля обов'язкові"));
    }
    if (rating < 1 || rating > 5) {
      return next(createError(400, "Рейтинг має бути від 1 до 5"));
    }

    const existingReview = await fetchOne(
      db
        .select()
        .from(reviews)
        .where(eq(reviews.reviewId, Number(reviewId)))
        .limit(1)
    );
    if (!existingReview) {
      return next(createError(404, "Відгук не знайдено"));
    }

    const userId = req.user && req.user.userId;
    if (!isValidUUID(userId)) {
      return next(createError(400, "Невірний ідентифікатор користувача"));
    }

    if (existingReview.userId !== userId) {
      return next(createError(403, "Ви не можете редагувати цей відгук"));
    }

    // Перевірка ліміту часу (10 хвилин для редагування)
    const reviewTimestamp = new Date(existingReview.reviewDate).getTime();
    if (Date.now() - reviewTimestamp > 10 * 60 * 1000) {
      return next(createError(403, "Час для редагування вичерпано"));
    }

    const [updatedReview] = await db
      .update(reviews)
      .set({ rating, comment })
      .where(eq(reviews.reviewId, Number(reviewId)))
      .returning();

    res.json(updatedReview);
  } catch (error) {
    next(createError(500, "Не вдалося оновити відгук"));
  }
});

// Видалення відгуку
router.delete("/reviews/:reviewId", authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const existingReview = await fetchOne(
      db
        .select()
        .from(reviews)
        .where(eq(reviews.reviewId, Number(reviewId)))
        .limit(1)
    );
    if (!existingReview) {
      return next(createError(404, "Відгук не знайдено"));
    }

    const userId = req.user && req.user.userId;
    if (!isValidUUID(userId)) {
      return next(createError(400, "Невірний ідентифікатор користувача"));
    }

    if (existingReview.userId !== userId) {
      return next(createError(403, "Ви не можете видалити цей відгук"));
    }

    await db.delete(reviews).where(eq(reviews.reviewId, Number(reviewId)));
    res.json({ message: "Відгук успішно видалено" });
  } catch (error) {
    next(createError(500, "Не вдалося видалити відгук"));
  }
});

export default router;
