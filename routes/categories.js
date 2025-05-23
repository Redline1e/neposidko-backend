import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { categories } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateAdmin } from "../middleware/auth.js";
import { uploadSingleImageMemory } from "../middleware/uploadToSupabase.js";
import { uploadToBucket } from "../utils/supabaseStorage.js";
import { supabase } from "../supabaseClient.js";

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
  uploadSingleImageMemory,
  async (req, res, next) => {
    try {
      const { name } = req.body;
      if (!name || !req.file) {
        return next(createError(400, "Назва та зображення обов'язкові"));
      }

      const publicUrl = await uploadToBucket(
        req.file.buffer,
        req.file.originalname
      );
      console.log(">>> Supabase publicUrl:", publicUrl);

      const [newCategory] = await db
        .insert(categories)
        .values({ name, imageUrl: publicUrl })
        .returning({
          categoryId: categories.categoryId,
          name: categories.name,
          imageUrl: categories.imageUrl,
        });

      console.log(">>> Inserted category:", newCategory);
      res.status(201).json(newCategory);
    } catch (error) {
      next(createError(500, error.message || "Не вдалося додати категорію"));
    }
  }
);

router.put(
  "/categories/:categoryId",
  authenticateAdmin,
  uploadSingleImageMemory,
  async (req, res, next) => {
    try {
      const { categoryId } = req.params;
      const { name } = req.body;

      const old = await db
        .select({ imageUrl: categories.imageUrl })
        .from(categories)
        .where(eq(categories.categoryId, Number(categoryId)))
        .then((r) => r[0]);
      if (!old) return next(createError(404, "Категорію не знайдено"));

      let newImageUrl = old.imageUrl;

      if (req.file) {
        // Видаляємо старе зображення
        if (old.imageUrl) {
          const oldKey = old.imageUrl.split("/").pop();
          const { error: deleteError } = await supabase.storage
            .from("images")
            .remove([oldKey]);
          if (deleteError) throw deleteError;
        }

        // Завантажуємо нове зображення
        newImageUrl = await uploadToBucket(
          req.file.buffer,
          req.file.originalname
        );
      }

      const [updated] = await db
        .update(categories)
        .set({ name, imageUrl: newImageUrl })
        .where(eq(categories.categoryId, Number(categoryId)))
        .returning();
      if (!updated) return next(createError(404, "Категорію не знайдено"));

      res.json(updated);
    } catch (err) {
      next(createError(500, err.message || "Не вдалося оновити категорію"));
    }
  }
);

router.delete(
  "/categories/:categoryId",
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const { categoryId } = req.params;

      const cat = await db
        .select({ imageUrl: categories.imageUrl })
        .from(categories)
        .where(eq(categories.categoryId, Number(categoryId)))
        .then((r) => r[0]);
      if (!cat) return next(createError(404, "Категорію не знайдено"));

      if (cat.imageUrl) {
        const key = cat.imageUrl.split("/").pop();
        const { error: deleteError } = await supabase.storage
          .from("images")
          .remove([key]);
        if (deleteError) throw deleteError;
      }

      await db
        .delete(categories)
        .where(eq(categories.categoryId, Number(categoryId)));

      res.json({ message: "Категорія та зображення успішно видалені" });
    } catch (err) {
      next(createError(500, err.message || "Не вдалося видалити категорію"));
    }
  }
);

export default router;
