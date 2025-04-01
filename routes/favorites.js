import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { favorites, products, productSizes } from "../db/schema.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { fetchOne } from "../utils.js";

const router = express.Router();

router.post("/favorites", optionalAuth, async (req, res, next) => {
  try {
    const { articleNumber } = req.body;
    if (!articleNumber)
      return next(createError(400, "articleNumber обов'язковий"));

    if (req.user) {
      const { userId } = req.user;
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
      if (existingFavorite.length)
        return next(createError(400, "Товар уже в улюблених"));

      const newFavorite = await db
        .insert(favorites)
        .values({ userId, articleNumber })
        .returning();
      res.status(201).json(newFavorite[0]);
    } else {
      req.session.favorites = req.session.favorites || [];
      if (req.session.favorites.includes(articleNumber))
        return next(createError(400, "Товар уже в улюблених"));
      req.session.favorites.push(articleNumber);
      res.status(201).json({ message: "Товар додано до улюблених" });
    }
  } catch (error) {
    next(createError(500, "Не вдалося додати до улюблених"));
  }
});

router.get("/favorites", optionalAuth, async (req, res, next) => {
  try {
    if (req.user) {
      const { userId } = req.user;
      const userFavorites = await db
        .select({
          articleNumber: favorites.articleNumber,
          name: products.name,
          price: products.price,
          discount: products.discount,
          imageUrls: products.imageUrls,
        })
        .from(favorites)
        .leftJoin(products, eq(favorites.articleNumber, products.articleNumber))
        .where(eq(favorites.userId, userId));

      const articleNumbers = userFavorites.map((f) => f.articleNumber);
      const allSizes =
        articleNumbers.length > 0
          ? await db
              .select({
                articleNumber: productSizes.articleNumber,
                size: productSizes.size,
                stock: productSizes.stock,
              })
              .from(productSizes)
              .where(inArray(productSizes.articleNumber, articleNumbers))
          : [];

      const enrichedFavorites = userFavorites.map((fav) => {
        const sizes = allSizes.filter(
          (s) => s.articleNumber === fav.articleNumber
        );
        return { ...fav, sizes };
      });
      res.json(enrichedFavorites);
    } else {
      const sessionFavorites = req.session.favorites || [];
      const enrichedFavorites = await Promise.all(
        sessionFavorites.map(async (articleNumber) => {
          const product = await fetchOne(
            db
              .select({
                articleNumber: products.articleNumber,
                name: products.name,
                price: products.price,
                discount: products.discount,
                imageUrls: products.imageUrls,
              })
              .from(products)
              .where(eq(products.articleNumber, articleNumber))
              .limit(1)
          );
          const sizes = product
            ? await db
                .select({ size: productSizes.size, stock: productSizes.stock })
                .from(productSizes)
                .where(eq(productSizes.articleNumber, articleNumber))
            : [];
          return { ...product, articleNumber, sizes };
        })
      );
      res.json(enrichedFavorites);
    }
  } catch (error) {
    next(createError(500, "Не вдалося отримати улюблені товари"));
  }
});

router.get(
  "/favorites/:articleNumber",
  authenticate,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const { userId } = req.user;
      const existingFavorite = await fetchOne(
        db
          .select()
          .from(favorites)
          .where(
            and(
              eq(favorites.userId, userId),
              eq(favorites.articleNumber, articleNumber)
            )
          )
          .limit(1)
      );
      res.json({ isFavorite: !!existingFavorite });
    } catch (error) {
      next(createError(500, "Не вдалося перевірити улюблений товар"));
    }
  }
);

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
      if (!deletedFavorite.length)
        return next(createError(404, "Товар не знайдено в улюблених"));
      res.json({ message: "Товар успішно видалено з улюблених" });
    } catch (error) {
      next(createError(500, "Не вдалося видалити товар з улюблених"));
    }
  }
);

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

export default router;
