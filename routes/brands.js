import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { brands } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateAdmin } from "../middleware/auth.js";
import { fetchOne } from "../utils.js";

const router = express.Router();

router.get("/brands", async (req, res, next) => {
  try {
    const allBrands = await db
      .select({ brandId: brands.brandId, name: brands.name })
      .from(brands);
    res.json(allBrands);
  } catch (error) {
    next(createError(500, "Не вдалося отримати бренди"));
  }
});

router.post("/brands", authenticateAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return next(createError(400, "Назва бренду обов'язкова"));

    const [newBrand] = await db.insert(brands).values({ name }).returning();
    res.status(201).json(newBrand);
  } catch (error) {
    next(createError(500, "Не вдалося додати бренд"));
  }
});

router.get("/brand/:brandId", async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const brand = await fetchOne(
      db
        .select({ name: brands.name })
        .from(brands)
        .where(eq(brands.brandId, Number(brandId)))
        .limit(1)
    );
    if (!brand) return next(createError(404, "Бренд не знайдено"));
    res.json({ brand });
  } catch (error) {
    next(createError(500, "Не вдалося отримати бренд"));
  }
});

router.put("/brand/:brandId", authenticateAdmin, async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const { name } = req.body;
    if (!name) return next(createError(400, "Назва бренду обов'язкова"));

    const [updatedBrand] = await db
      .update(brands)
      .set({ name })
      .where(eq(brands.brandId, Number(brandId)))
      .returning();
    if (!updatedBrand) return next(createError(404, "Бренд не знайдено"));
    res.json(updatedBrand);
  } catch (error) {
    next(createError(500, "Не вдалося оновити бренд"));
  }
});

router.delete("/brand/:brandId", authenticateAdmin, async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const deleted = await db
      .delete(brands)
      .where(eq(brands.brandId, Number(brandId)))
      .returning();
    if (!deleted.length) return next(createError(404, "Бренд не знайдено"));
    res.json({ message: "Бренд успішно видалено" });
  } catch (error) {
    next(createError(500, "Не вдалося видалити бренд"));
  }
});

export default router;
