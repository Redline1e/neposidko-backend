import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import {
  orders,
  orderItems,
  products,
  reviews,
  users,
  orderStatus,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateAdmin } from "../middleware/auth.js";
import { uploadExcel } from "../middleware/upload.js";
import xlsx from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { fetchOne } from "../utils.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get("/orders", authenticateAdmin, async (req, res, next) => {
  try {
    const allOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        orderDate: orders.orderDate,
        deliveryAddress: orders.deliveryAddress,
        telephone: orders.telephone,
        paymentMethod: orders.paymentMethod,
        userEmail: users.email,
        statusName: orderStatus.name,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.userId))
      .leftJoin(
        orderStatus,
        eq(orders.orderStatusId, orderStatus.orderStatusId)
      );
    res.json(allOrders);
  } catch (error) {
    next(createError(500, "Не вдалося отримати замовлення"));
  }
});

router.get("/orders/:orderId", authenticateAdmin, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await fetchOne(
      db
        .select({
          orderId: orders.orderId,
          userId: orders.userId,
          orderStatusId: orders.orderStatusId,
          orderDate: orders.orderDate,
          deliveryAddress: orders.deliveryAddress,
          telephone: orders.telephone,
          paymentMethod: orders.paymentMethod,
          userEmail: users.email,
          statusName: orderStatus.name,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.userId))
        .leftJoin(
          orderStatus,
          eq(orders.orderStatusId, orderStatus.orderStatusId)
        )
        .where(eq(orders.orderId, Number(orderId)))
    );
    if (!order) return next(createError(404, "Замовлення не знайдено"));

    const items = await db
      .select({
        orderItemId: orderItems.productOrderId,
        orderId: orderItems.orderId,
        articleNumber: orderItems.articleNumber,
        size: orderItems.size,
        quantity: orderItems.quantity,
        price: products.price,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.articleNumber, products.articleNumber))
      .where(eq(orderItems.orderId, Number(orderId)));
    res.json({ ...order, items });
  } catch (error) {
    next(createError(500, "Не вдалося отримати деталі замовлення"));
  }
});

router.put("/orders/:orderId", authenticateAdmin, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { orderStatusId, deliveryAddress, telephone, paymentMethod } =
      req.body;
    const [updatedOrder] = await db
      .update(orders)
      .set({ orderStatusId, deliveryAddress, telephone, paymentMethod })
      .where(eq(orders.orderId, Number(orderId)))
      .returning();
    if (!updatedOrder) return next(createError(404, "Замовлення не знайдено"));
    res.json(updatedOrder);
  } catch (error) {
    next(createError(500, "Не вдалося оновити замовлення"));
  }
});

router.delete("/orders/:orderId", authenticateAdmin, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const deleted = await db
      .delete(orders)
      .where(eq(orders.orderId, Number(orderId)))
      .returning();
    if (!deleted.length)
      return next(createError(404, "Замовлення не знайдено"));
    res.json({ message: "Замовлення успішно видалено" });
  } catch (error) {
    next(createError(500, "Не вдалося видалити замовлення"));
  }
});

router.get("/reviews", authenticateAdmin, async (req, res, next) => {
  try {
    const allReviews = await db
      .select({
        reviewId: reviews.reviewId,
        userId: reviews.userId,
        articleNumber: reviews.articleNumber,
        rating: reviews.rating,
        comment: reviews.comment,
        reviewDate: reviews.reviewDate,
        userEmail: users.email,
        productName: products.name,
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.userId))
      .leftJoin(products, eq(reviews.articleNumber, products.articleNumber));
    res.json(allReviews);
  } catch (error) {
    next(createError(500, "Не вдалося отримати коментарі"));
  }
});

router.put("/reviews/:reviewId", authenticateAdmin, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const [updatedReview] = await db
      .update(reviews)
      .set({ rating, comment })
      .where(eq(reviews.reviewId, Number(reviewId)))
      .returning();
    if (!updatedReview) return next(createError(404, "Коментар не знайдено"));
    res.json(updatedReview);
  } catch (error) {
    next(createError(500, "Не вдалося оновити коментар"));
  }
});

router.delete(
  "/reviews/:reviewId",
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const { reviewId } = req.params;
      const deleted = await db
        .delete(reviews)
        .where(eq(reviews.reviewId, Number(reviewId)))
        .returning();
      if (!deleted.length)
        return next(createError(404, "Коментар не знайдено"));
      res.json({ message: "Коментар успішно видалено" });
    } catch (error) {
      next(createError(500, "Не вдалося видалити коментар"));
    }
  }
);

router.get("/users", authenticateAdmin, async (req, res, next) => {
  try {
    const allUsers = await db
      .select({
        userId: users.userId,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        telephone: users.telephone,
        deliveryAddress: users.deliveryAddress,
      })
      .from(users);
    res.json(allUsers);
  } catch (error) {
    next(createError(500, "Не вдалося отримати користувачів"));
  }
});

router.put("/users/:userId", authenticateAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { name, email, roleId, telephone, deliveryAddress } = req.body;
    const [updatedUser] = await db
      .update(users)
      .set({ name, email, roleId, telephone, deliveryAddress })
      .where(eq(users.userId, userId))
      .returning();
    if (!updatedUser) return next(createError(404, "Користувача не знайдено"));
    res.json(updatedUser);
  } catch (error) {
    next(createError(500, "Не вдалося оновити користувача"));
  }
});
router.delete("/users/:userId", authenticateAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const deleted = await db
      .delete(users)
      .where(eq(users.userId, userId))
      .returning();
    if (!deleted.length)
      return next(createError(404, "Користувача не знайдено"));
    res.json({ message: "Користувача успішно видалено" });
  } catch (error) {
    next(createError(500, "Не вдалося видалити користувача"));
  }
});

router.get("/generate-report", authenticateAdmin, async (req, res, next) => {
  try {
    const allOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        orderDate: orders.orderDate,
        deliveryAddress: orders.deliveryAddress,
        telephone: orders.telephone,
        paymentMethod: orders.paymentMethod,
        userEmail: users.email,
        userName: users.name,
        statusName: orderStatus.name,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.userId))
      .leftJoin(
        orderStatus,
        eq(orders.orderStatusId, orderStatus.orderStatusId)
      );

    const worksheetData = allOrders.map((order) => ({
      "ID замовлення": order.orderId,
      "Ім'я користувача": order.userName || "Не вказано",
      "Пошта користувача": order.userEmail || "Не вказано",
      Статус: order.statusName || "Не визначено",
      "Дата замовлення": order.orderDate.toISOString(),
      "Адреса доставки": order.deliveryAddress || "Не вказано",
      Телефон: order.telephone || "Не вказано",
      "Метод оплати": order.paymentMethod || "Не вказано",
    }));

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(worksheetData);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Замовлення");

    const filePath = path.join(__dirname, "report.xlsx");
    xlsx.writeFile(workbook, filePath);

    res.download(filePath, "orders_report.xlsx", async (err) => {
      if (err) next(err);
      await fs.unlink(filePath);
    });
  } catch (error) {
    next(createError(500, "Помилка формування звіту"));
  }
});

router.post(
  "/upload-excel",
  authenticateAdmin,
  uploadExcel.single("file"),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) return next(createError(400, "Файл не завантажено"));

      const workbook = xlsx.readFile(file.path, { cellDates: true });
      const brandsSheet = workbook.Sheets["Brands"];
      const categoriesSheet = workbook.Sheets["Categories"];
      const productsSheet = workbook.Sheets["Products"];
      if (!brandsSheet || !categoriesSheet || !productsSheet) {
        return next(
          createError(
            400,
            'Файл повинен містити аркуші "Brands", "Categories" і "Products"'
          )
        );
      }

      const brandsData = xlsx.utils.sheet_to_json(brandsSheet);
      const categoriesData = xlsx.utils.sheet_to_json(categoriesSheet);
      const productsData = xlsx.utils.sheet_to_json(productsSheet);

      const log = { added: 0, updated: 0, skipped: 0, errors: [] };
      await db.transaction(async (tx) => {
        for (const brand of brandsData) {
          if (!brand.name || typeof brand.name !== "string") {
            log.errors.push("Пропущено бренд: name обов'язковий");
            continue;
          }
          const existingBrand = await tx
            .select()
            .from(brands)
            .where(eq(brands.name, brand.name))
            .limit(1);
          if (existingBrand.length) {
            log.skipped++;
          } else {
            await tx.insert(brands).values({ name: brand.name });
            log.added++;
          }
        }

        for (const category of categoriesData) {
          if (!category.name || typeof category.name !== "string") {
            log.errors.push("Пропущено категорію: name обов'язковий");
            continue;
          }
          const existingCategory = await tx
            .select()
            .from(categories)
            .where(eq(categories.name, category.name))
            .limit(1);
          if (existingCategory.length) {
            if (
              category.imageUrl &&
              category.imageUrl !== existingCategory[0].imageUrl
            ) {
              await tx
                .update(categories)
                .set({ imageUrl: category.imageUrl })
                .where(
                  eq(categories.categoryId, existingCategory[0].categoryId)
                );
              log.updated++;
            } else {
              log.skipped++;
            }
          } else {
            await tx.insert(categories).values({
              name: category.name,
              imageUrl: category.imageUrl || null,
            });
            log.added++;
          }
        }

        for (const product of productsData) {
          if (
            !product.articleNumber ||
            !product.brand ||
            !product.category ||
            !product.price ||
            !product.name
          ) {
            log.errors.push(
              `Пропущено продукт: обов'язкові поля відсутні (${JSON.stringify(
                product
              )})`
            );
            continue;
          }
          if (typeof product.price !== "number" || isNaN(product.price)) {
            log.errors.push(
              `Пропущено продукт ${product.articleNumber}: price має бути числом`
            );
            continue;
          }

          const brand = await tx
            .select()
            .from(brands)
            .where(eq(brands.name, product.brand))
            .limit(1);
          if (!brand.length) {
            log.errors.push(
              `Пропущено продукт ${product.articleNumber}: бренд "${product.brand}" не знайдено`
            );
            continue;
          }

          const category = await tx
            .select()
            .from(categories)
            .where(eq(categories.name, product.category))
            .limit(1);
          if (!category.length) {
            log.errors.push(
              `Пропущено продукт ${product.articleNumber}: категорія "${product.category}" не знайдена`
            );
            continue;
          }

          const existingProduct = await tx
            .select()
            .from(products)
            .where(eq(products.articleNumber, product.articleNumber))
            .limit(1);
          const imageUrls = product.imageUrls
            ? String(product.imageUrls)
                .split(",")
                .map((url) => url.trim())
            : [];

          if (existingProduct.length) {
            const existingImages = existingProduct[0].imageUrls || [];
            const isDuplicate =
              existingProduct[0].name === product.name &&
              existingProduct[0].price === product.price &&
              existingProduct[0].description === (product.description || "") &&
              JSON.stringify(existingImages) === JSON.stringify(imageUrls);

            if (isDuplicate) {
              log.skipped++;
              continue;
            }

            await tx
              .update(products)
              .set({
                brandId: brand[0].brandId,
                price: product.price,
                discount: product.discount
                  ? Number(product.discount)
                  : existingProduct[0].discount,
                name: product.name,
                description:
                  product.description || existingProduct[0].description,
                imageUrls:
                  imageUrls.length > 0
                    ? imageUrls
                    : existingProduct[0].imageUrls,
                isActive: true,
              })
              .where(eq(products.articleNumber, product.articleNumber));

            await tx
              .update(productCategories)
              .set({
                categoryId: category[0].categoryId,
                imageUrl: imageUrls[0] || null,
              })
              .where(
                eq(productCategories.articleNumber, product.articleNumber)
              );

            if (product.sizes) {
              try {
                const sizes = JSON.parse(product.sizes);
                if (Array.isArray(sizes)) {
                  await tx
                    .delete(productSizes)
                    .where(
                      eq(productSizes.articleNumber, product.articleNumber)
                    );
                  for (const sizeObj of sizes) {
                    const { size, stock } = sizeObj;
                    if (size && stock != null) {
                      await tx.insert(productSizes).values({
                        articleNumber: product.articleNumber,
                        size,
                        stock: Number(stock),
                      });
                    }
                  }
                }
              } catch (error) {
                log.errors.push(
                  `Помилка парсингу розмірів для продукту ${product.articleNumber}: ${error.message}`
                );
              }
            }
            log.updated++;
          } else {
            await tx.insert(products).values({
              articleNumber: product.articleNumber,
              brandId: brand[0].brandId,
              price: product.price,
              discount: product.discount ? Number(product.discount) : 0,
              name: product.name,
              description: product.description || "",
              imageUrls,
              isActive: true,
            });

            await tx.insert(productCategories).values({
              articleNumber: product.articleNumber,
              categoryId: category[0].categoryId,
              imageUrl: imageUrls[0] || null,
            });

            if (product.sizes) {
              try {
                const sizes = JSON.parse(product.sizes);
                if (Array.isArray(sizes)) {
                  for (const sizeObj of sizes) {
                    const { size, stock } = sizeObj;
                    if (size && stock != null) {
                      await tx.insert(productSizes).values({
                        articleNumber: product.articleNumber,
                        size,
                        stock: Number(stock),
                      });
                    }
                  }
                }
              } catch (error) {
                log.errors.push(
                  `Помилка парсингу розмірів для продукту ${product.articleNumber}: ${error.message}`
                );
              }
            }
            log.added++;
          }
        }
      });

      await fs.unlink(file.path);
      res.json({ message: "Дані успішно імпортовано", log });
    } catch (error) {
      next(createError(500, "Помилка імпорту даних"));
    }
  }
);

export default router;
