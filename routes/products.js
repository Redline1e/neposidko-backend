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
import { uploadMultipleImages } from "../middleware/upload.js";
import { fetchOne, deleteFiles } from "../utils.js";

const router = express.Router();

router.get("/products", async (req, res, next) => {
  try {
    const allProducts = await db
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

    const articleNumbers = allProducts.map((p) => p.articleNumber);
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

    const productsWithSizes = allProducts.map((prod) => {
      const sizes = allSizes.filter(
        (s) => s.articleNumber === prod.articleNumber
      );
      return { ...prod, sizes };
    });

    res.json(productsWithSizes);
  } catch (error) {
    next(createError(500, "Не вдалося отримати продукти"));
  }
});

router.post(
  "/products",
  authenticateAdmin,
  uploadMultipleImages,
  async (req, res, next) => {
    try {
      const {
        articleNumber,
        brandId,
        categoryId,
        price,
        discount,
        name,
        description,
        sizes,
      } = req.body;
      const files = req.files;
      if (
        !articleNumber ||
        !brandId ||
        !categoryId ||
        !price ||
        !name ||
        !description
      ) {
        return next(createError(400, "Усі поля обов'язкові"));
      }
      if (!files || files.length === 0)
        return next(createError(400, "Потрібно хоча б одне зображення"));

      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.articleNumber, articleNumber))
        .limit(1);
      if (existingProduct.length > 0)
        return next(createError(409, "Товар з таким articleNumber уже існує"));

      const imageUrls = files.map(
        (file) => `${req.protocol}://${req.get("host")}/images/${file.filename}`
      );
      let newProduct;

      await db.transaction(async (tx) => {
        const [insertedProduct] = await tx
          .insert(products)
          .values({
            articleNumber,
            brandId: Number(brandId),
            price: Number(price),
            discount: discount ? Number(discount) : 0,
            name,
            description,
            imageUrls,
            isActive: true,
          })
          .returning();
        newProduct = insertedProduct;

        await tx
          .insert(productCategories)
          .values({
            articleNumber,
            categoryId: Number(categoryId),
            imageUrl: imageUrls[0],
          });

        const parsedSizes = sizes ? JSON.parse(sizes) : [];
        if (Array.isArray(parsedSizes)) {
          for (const sizeObj of parsedSizes) {
            const { size, stock } = sizeObj;
            if (size && stock != null) {
              await tx
                .insert(productSizes)
                .values({ articleNumber, size, stock: Number(stock) });
            }
          }
        }
      });

      res.status(201).json(newProduct);
    } catch (error) {
      if (req.files) await deleteFiles(req.files);
      next(createError(500, "Не вдалося додати продукт"));
    }
  }
);

router.get("/products/active", async (req, res, next) => {
  try {
    const activeProducts = await db
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

    const articleNumbers = activeProducts.map((p) => p.articleNumber);
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

    const productsWithSizes = activeProducts.map((prod) => {
      const sizes = allSizes.filter(
        (s) => s.articleNumber === prod.articleNumber
      );
      return { ...prod, sizes };
    });

    res.json(productsWithSizes);
  } catch (error) {
    next(createError(500, "Не вдалося отримати активні продукти"));
  }
});

router.get("/products/inactive", async (req, res, next) => {
  try {
    const inactiveProducts = await db
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

    const articleNumbers = inactiveProducts.map((p) => p.articleNumber);
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

    const productsWithSizes = inactiveProducts.map((prod) => {
      const sizes = allSizes.filter(
        (s) => s.articleNumber === prod.articleNumber
      );
      return { ...prod, sizes };
    });

    res.json(productsWithSizes);
  } catch (error) {
    next(createError(500, "Не вдалося отримати неактивні продукти"));
  }
});

router.patch(
  "/product/:articleNumber/active",
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const { isActive } = req.body;
      if (typeof isActive !== "boolean")
        return next(createError(400, "isActive має бути булевим значенням"));

      const [updatedProduct] = await db
        .update(products)
        .set({ isActive })
        .where(eq(products.articleNumber, articleNumber))
        .returning();
      if (!updatedProduct) return next(createError(404, "Продукт не знайдено"));
      res.json(updatedProduct);
    } catch (error) {
      next(createError(500, "Не вдалося оновити статус продукту"));
    }
  }
);

router.get("/product/:articleNumber", async (req, res, next) => {
  try {
    const { articleNumber } = req.params;
    const product = await fetchOne(
      db
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
        .where(eq(products.articleNumber, articleNumber))
        .limit(1)
    );

    if (!product || !product.isActive)
      return next(createError(404, "Продукт не знайдено"));

    const sizes = await db
      .select({ size: productSizes.size, stock: productSizes.stock })
      .from(productSizes)
      .where(eq(productSizes.articleNumber, articleNumber));

    res.json({ ...product, sizes });
  } catch (error) {
    next(createError(500, "Не вдалося отримати дані продукту"));
  }
});

router.put(
  "/product/:articleNumber",
  authenticateAdmin,
  uploadMultipleImages,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const oldProduct = await db
        .select({ imageUrls: products.imageUrls })
        .from(products)
        .where(eq(products.articleNumber, articleNumber))
        .then((results) => results[0]);
      if (!oldProduct) return next(createError(404, "Продукт не знайдено"));

      const newImageUrls = req.body.imageUrls
        ? JSON.parse(req.body.imageUrls)
        : [];
      let uploadedImageUrls = [];
      if (req.files && req.files.length > 0) {
        uploadedImageUrls = req.files.map(
          (file) =>
            `${req.protocol}://${req.get("host")}/images/${file.filename}`
        );
      }
      const finalImageUrls = [...newImageUrls, ...uploadedImageUrls];

      const imagesToDelete = oldProduct.imageUrls.filter(
        (url) => !finalImageUrls.includes(url)
      );
      if (imagesToDelete.length > 0) await deleteFiles(imagesToDelete);

      const updatedFields = {
        brandId: Number(req.body.brandId),
        price: Number(req.body.price),
        discount: Number(req.body.discount),
        name: req.body.name,
        description: req.body.description,
        imageUrls: finalImageUrls,
      };

      let updatedProduct;
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(products)
          .set(updatedFields)
          .where(eq(products.articleNumber, articleNumber))
          .returning();
        updatedProduct = updated;

        const sizes = req.body.sizes ? JSON.parse(req.body.sizes) : [];
        if (Array.isArray(sizes)) {
          await tx
            .delete(productSizes)
            .where(eq(productSizes.articleNumber, articleNumber));
          for (const sizeObj of sizes) {
            const { size, stock } = sizeObj;
            if (size && stock != null) {
              await tx
                .insert(productSizes)
                .values({ articleNumber, size, stock: Number(stock) });
            }
          }
        }
      });

      res.json(updatedProduct);
    } catch (error) {
      next(createError(500, "Не вдалося оновити продукт"));
    }
  }
);

router.delete(
  "/product/:articleNumber",
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const product = await fetchOne(
        db
          .select({ imageUrls: products.imageUrls })
          .from(products)
          .where(eq(products.articleNumber, articleNumber))
      );
      if (!product) return next(createError(404, "Продукт не знайдено"));

      if (product.imageUrls?.length) await deleteFiles(product.imageUrls);

      const deleted = await db
        .delete(products)
        .where(eq(products.articleNumber, articleNumber))
        .returning();
      if (!deleted.length) return next(createError(404, "Продукт не знайдено"));

      res.json({ message: "Продукт успішно видалено" });
    } catch (error) {
      next(createError(500, "Не вдалося видалити продукт"));
    }
  }
);

router.get("/search", async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string")
      return next(createError(400, "Вкажіть параметр пошуку (q)"));

    const productsList = await db
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

    const articleNumbers = productsList.map((p) => p.articleNumber);
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

    const productsWithSizes = productsList.map((prod) => {
      const sizes = allSizes.filter(
        (s) => s.articleNumber === prod.articleNumber
      );
      return { ...prod, sizes };
    });

    res.json(productsWithSizes);
  } catch (error) {
    next(createError(500, "Помилка пошуку товарів"));
  }
});

export default router;
