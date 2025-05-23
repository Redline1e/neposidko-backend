import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import {
  products,
  brands,
  categories,
  productCategories,
  productSizes,
} from "../db/schema.js";
import { eq, ilike, or, inArray } from "drizzle-orm";
import { authenticateAdmin } from "../middleware/auth.js";
import { uploadMultipleImagesMemory } from "../middleware/uploadToSupabase.js";
import { uploadToBucket } from "../utils/supabaseStorage.js";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

router.get("/products", async (req, res, next) => {
  try {
    const all = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
        brandId: products.brandId,
        category: categories.name,
        categoryId: categories.categoryId,
        isActive: products.isActive,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .leftJoin(
        productCategories,
        eq(products.articleNumber, productCategories.articleNumber)
      )
      .leftJoin(
        categories,
        eq(productCategories.categoryId, categories.categoryId)
      );

    const ids = all.map((p) => p.articleNumber);
    const sizes = ids.length
      ? await db
          .select({
            articleNumber: productSizes.articleNumber,
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(inArray(productSizes.articleNumber, ids))
      : [];

    res.json(
      all.map((p) => ({
        ...p,
        sizes: sizes.filter((s) => s.articleNumber === p.articleNumber),
      }))
    );
  } catch {
    next(createError(500, "Не вдалося отримати продукти"));
  }
});

router.post(
  "/products",
  authenticateAdmin,
  uploadMultipleImagesMemory,
  async (req, res, next) => {
    try {
      const {
        brandId,
        categoryId,
        price,
        discount,
        name,
        description,
        sizes,
        articleNumber,
      } = req.body;
      const imageFiles = req.files;

      if (
        !brandId ||
        !categoryId ||
        !price ||
        !name ||
        !description ||
        !articleNumber
      ) {
        return next(createError(400, "Усі поля обов'язкові"));
      }

      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.articleNumber, articleNumber))
        .limit(1);

      if (existingProduct.length > 0) {
        return next(createError(409, "Товар із таким артикулом уже існує"));
      }

      let imageUrls = [];
      if (imageFiles && imageFiles.length > 0) {
        imageUrls = await Promise.all(
          imageFiles.map(async (file) =>
            uploadToBucket(file.buffer, file.originalname)
          )
        );
      }

      imageUrls = imageUrls.filter((url) => url && typeof url === "string");

      let sizesArr = [];
      if (sizes) {
        try {
          sizesArr = JSON.parse(sizes);
        } catch (error) {
          return next(createError(400, "Некоректний формат sizes"));
        }
      }

      await db.transaction(async (tx) => {
        await tx.insert(products).values({
          articleNumber,
          brandId: +brandId,
          price: +price,
          discount: discount ? +discount : 0,
          name,
          description,
          imageUrls,
          isActive: true,
        });

        await tx.insert(productCategories).values({
          articleNumber,
          categoryId: +categoryId,
          imageUrl: imageUrls[0] || null,
        });

        for (const { size, stock } of sizesArr) {
          if (size && stock != null) {
            await tx.insert(productSizes).values({
              articleNumber,
              size,
              stock: +stock,
            });
          }
        }
      });

      res.status(201).json({ message: "Продукт успішно додано" });
    } catch (error) {
      next(createError(500, error.message || "Не вдалося додати продукт"));
    }
  }
);

router.put(
  "/product/:articleNumber",
  authenticateAdmin,
  uploadMultipleImagesMemory,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const {
        brandId,
        categoryId,
        price,
        discount,
        name,
        description,
        sizes,
        existingImageUrls,
      } = req.body;
      const imageFiles = req.files;

      if (!brandId || !categoryId || !price || !name || !description) {
        return next(createError(400, "Усі поля обов'язкові"));
      }

      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.articleNumber, articleNumber))
        .limit(1);
      if (!existingProduct.length) {
        return next(createError(404, "Продукт не знайдено"));
      }

      const oldImageUrls = existingProduct[0].imageUrls || [];
      const parsedExistingImageUrls = existingImageUrls
        ? JSON.parse(existingImageUrls)
        : [];

      const imagesToDelete = oldImageUrls.filter(
        (url) => !parsedExistingImageUrls.includes(url)
      );

      if (imagesToDelete.length > 0) {
        const keysToDelete = imagesToDelete
          .map((url) => url.split("/").pop())
          .filter((key) => key);
        if (keysToDelete.length > 0) {
          const { error: deleteError } = await supabase.storage
            .from("images")
            .remove(keysToDelete);
          if (deleteError) throw deleteError;
        }
      }

      let newImageUrls = [];
      if (imageFiles && imageFiles.length > 0) {
        newImageUrls = await Promise.all(
          imageFiles.map((file) =>
            uploadToBucket(file.buffer, file.originalname)
          )
        );
      }

      const updatedImageUrls = [...parsedExistingImageUrls, ...newImageUrls];

      let sizesArr = [];
      if (sizes) {
        try {
          sizesArr = JSON.parse(sizes);
        } catch (error) {
          return next(createError(400, "Некоректний формат sizes"));
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(products)
          .set({
            brandId: +brandId,
            price: +price,
            discount: discount ? +discount : 0,
            name,
            description,
            imageUrls: updatedImageUrls,
            isActive: true,
          })
          .where(eq(products.articleNumber, articleNumber));

        await tx
          .update(productCategories)
          .set({
            categoryId: +categoryId,
            imageUrl: updatedImageUrls[0] || null,
          })
          .where(eq(productCategories.articleNumber, articleNumber));

        await tx
          .delete(productSizes)
          .where(eq(productSizes.articleNumber, articleNumber));
        for (const { size, stock } of sizesArr) {
          if (size && stock != null) {
            await tx.insert(productSizes).values({
              articleNumber,
              size,
              stock: +stock,
            });
          }
        }
      });

      res.json({ message: "Продукт успішно оновлено" });
    } catch (error) {
      next(createError(500, error.message || "Не вдалося оновити продукт"));
    }
  }
);

router.delete(
  "/product/:articleNumber",
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;

      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.articleNumber, articleNumber))
        .limit(1);

      if (!existingProduct.length) {
        return next(createError(404, "Продукт не знайдено"));
      }

      const product = existingProduct[0];
      const imageUrls = product.imageUrls || [];

      if (imageUrls.length > 0) {
        const keysToDelete = imageUrls
          .map((url) => url.split("/").pop())
          .filter((key) => key);
        if (keysToDelete.length > 0) {
          const { error: deleteError } = await supabase.storage
            .from("images")
            .remove(keysToDelete);
          if (deleteError) {
            throw new Error(
              `Не вдалося видалити зображення: ${deleteError.message}`
            );
          }
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(productSizes)
          .where(eq(productSizes.articleNumber, articleNumber));
        await tx
          .delete(productCategories)
          .where(eq(productCategories.articleNumber, articleNumber));
        await tx
          .delete(products)
          .where(eq(products.articleNumber, articleNumber));
      });

      res.json({ message: "Продукт успішно видалено" });
    } catch (error) {
      console.error("Delete product error:", error);
      next(createError(500, error.message || "Не вдалося видалити продукт"));
    }
  }
);

router.get("/products/active", async (req, res, next) => {
  try {
    const active = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
        brandId: products.brandId,
        category: categories.name,
        categoryId: categories.categoryId,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .leftJoin(
        productCategories,
        eq(products.articleNumber, productCategories.articleNumber)
      )
      .leftJoin(
        categories,
        eq(productCategories.categoryId, categories.categoryId)
      );

    const ids = active.map((p) => p.articleNumber);
    const sizes = ids.length
      ? await db
          .select({
            articleNumber: productSizes.articleNumber,
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(inArray(productSizes.articleNumber, ids))
      : [];

    res.json(
      active.map((p) => ({
        ...p,
        sizes: sizes.filter((s) => s.articleNumber === p.articleNumber),
      }))
    );
  } catch {
    next(createError(500, "Не вдалося отримати активні продукти"));
  }
});

router.get("/products/inactive", async (req, res, next) => {
  try {
    const inactive = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
        brandId: products.brandId,
        category: categories.name,
        categoryId: categories.categoryId,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.isActive, false))
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .leftJoin(
        productCategories,
        eq(products.articleNumber, productCategories.articleNumber)
      )
      .leftJoin(
        categories,
        eq(productCategories.categoryId, categories.categoryId)
      );

    const ids = inactive.map((p) => p.articleNumber);
    const sizes = ids.length
      ? await db
          .select({
            articleNumber: productSizes.articleNumber,
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(inArray(productSizes.articleNumber, ids))
      : [];

    res.json(
      inactive.map((p) => ({
        ...p,
        sizes: sizes.filter((s) => s.articleNumber === p.articleNumber),
      }))
    );
  } catch {
    next(createError(500, "Не вдалося отримати неактивні продукти"));
  }
});

// PATCH /product/:articleNumber/active
router.patch(
  "/product/:articleNumber/active",
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const { isActive } = req.body;
      if (typeof isActive !== "boolean")
        return next(createError(400, "isActive має бути Boolean"));
      const [u] = await db
        .update(products)
        .set({ isActive })
        .where(eq(products.articleNumber, articleNumber))
        .returning();
      if (!u) return next(createError(404, "Продукт не знайдено"));
      res.json(u);
    } catch {
      next(createError(500, "Не вдалося оновити статус продукту"));
    }
  }
);

router.get("/product/:articleNumber", async (req, res, next) => {
  try {
    const { articleNumber } = req.params;
    const prod = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
        brandId: products.brandId,
        category: categories.name,
        categoryId: categories.categoryId,
        isActive: products.isActive,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .leftJoin(
        productCategories,
        eq(products.articleNumber, productCategories.articleNumber)
      )
      .leftJoin(
        categories,
        eq(productCategories.categoryId, categories.categoryId)
      )
      .where(eq(products.articleNumber, articleNumber))
      .limit(1)
      .then((r) => r[0]);

    if (!prod || !prod.isActive)
      return next(createError(404, "Продукт не знайдено або неактивний"));

    const sizes = await db
      .select({ size: productSizes.size, stock: productSizes.stock })
      .from(productSizes)
      .where(eq(productSizes.articleNumber, articleNumber));

    res.json({ ...prod, sizes });
  } catch {
    next(createError(500, "Не вдалося отримати продукт"));
  }
});

// GET /search?q=...
router.get("/search", async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string")
      return next(createError(400, "Вкажіть параметр q"));
    const found = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
        isActive: products.isActive,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .where(
        or(
          ilike(products.name, `%${q}%`),
          ilike(products.articleNumber, `%${q}%`)
        )
      );

    const ids = found.map((p) => p.articleNumber);
    const sizes = ids.length
      ? await db
          .select({
            articleNumber: productSizes.articleNumber,
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(inArray(productSizes.articleNumber, ids))
      : [];

    res.json(
      found.map((p) => ({
        ...p,
        sizes: sizes.filter((s) => s.articleNumber === p.articleNumber),
      }))
    );
  } catch {
    next(createError(500, "Помилка пошуку товарів"));
  }
});

export default router;
