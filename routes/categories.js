import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { categories } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateAdmin } from "../middleware/auth.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { fetchOne, deleteFiles } from "../utils.js";

const router = express.Router();

router.get("/categories", async (req, res, next) => {
  try {
    const allCategories = await db
      .select({
        categoryId: categories.categoryId,
        name: categories.name,
        imageUrl: categories.imageUrl,
      })
      .from(categories);
    const sanitizedCategories = allCategories.map((category) => ({
      ...category,
      imageUrl: category.imageUrl ?? "",
    }));
    res.json(sanitizedCategories);
  } catch (error) {
    next(createError(500, "Не вдалося отримати категорії"));
  }
});

router.post(
  "/categories",
  authenticateAdmin,
  uploadSingleImage,
  async (req, res, next) => {
    try {
      const { name } = req.body; // Назва категорії
      const file = req.file; // Завантажений файл

      if (!name || !file) {
        if (file) await deleteFiles([file]); // Видалити файл, якщо він був завантажений
        return next(createError(400, "Назва та зображення обов'язкові"));
      }

      // Перевірка формату файлу (додатково)
      if (!file.mimetype.startsWith("image/")) {
        await deleteFiles([file]);
        return next(createError(400, "Файл має бути зображенням"));
      }

      // Генерація URL для зображення
      const imageUrl = `${req.protocol}://${req.get("host")}/images/${
        file.filename
      }`;

      // Вставка в базу даних
      const [newCategory] = await db
        .insert(categories)
        .values({ name, imageUrl })
        .returning();

      res.status(201).json(newCategory);
    } catch (error) {
      if (req.file) await deleteFiles([req.file]); // Видалити файл у разі помилки
      next(createError(500, "Не вдалося додати категорію"));
    }
  }
);

router.put(
  "/categories/:categoryId",
  authenticateAdmin,
  uploadSingleImage,
  async (req, res, next) => {
    try {
      const { categoryId } = req.params;
      const { name } = req.body;
      const file = req.file;
      if (!name) return next(createError(400, "Назва категорії обов'язкова"));

      let imageUrl = file
        ? `${req.protocol}://${req.get("host")}/images/${file.filename}`
        : (
            await fetchOne(
              db
                .select({ imageUrl: categories.imageUrl })
                .from(categories)
                .where(eq(categories.categoryId, Number(categoryId)))
            )
          )?.imageUrl;

      const [updatedCategory] = await db
        .update(categories)
        .set({ name, imageUrl })
        .where(eq(categories.categoryId, Number(categoryId)))
        .returning();
      if (!updatedCategory)
        return next(createError(404, "Категорію не знайдено"));
      res.json(updatedCategory);
    } catch (error) {
      if (req.file) await deleteFiles([req.file]);
      next(createError(500, "Не вдалося оновити категорію"));
    }
  }
);

router.delete(
  "/categories/:categoryId",
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const { categoryId } = req.params;
      const category = await fetchOne(
        db
          .select({ imageUrl: categories.imageUrl })
          .from(categories)
          .where(eq(categories.categoryId, Number(categoryId)))
      );
      if (!category) return next(createError(404, "Категорію не знайдено"));

      if (category.imageUrl) await deleteFiles([category.imageUrl]);

      const deleted = await db
        .delete(categories)
        .where(eq(categories.categoryId, Number(categoryId)))
        .returning();
      if (!deleted.length)
        return next(createError(404, "Категорію не знайдено"));

      res.json({ message: "Категорія успішно видалена" });
    } catch (error) {
      next(createError(500, "Не вдалося видалити категорію"));
    }
  }
);

export default router;
