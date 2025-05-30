import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { orders, orderItems, productSizes } from "../db/schema.js";
import { eq, or, and } from "drizzle-orm";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { fetchOne } from "../utils.js";
import axios from "axios";

const router = express.Router();

router.get("/orders", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const userOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        orderDate: orders.orderDate,
      })
      .from(orders)
      .where(eq(orders.userId, userId));
    res.json(userOrders);
  } catch (error) {
    next(createError(500, "Не вдалося отримати замовлення"));
  }
});

router.post("/orders", authenticate, async (req, res, next) => {
  try {
    const { orderStatusId } = req.body;
    const { userId } = req.user;
    const [newOrder] = await db
      .insert(orders)
      .values({ userId, orderStatusId })
      .returning();
    res.status(201).json(newOrder);
  } catch (error) {
    next(createError(500, "Не вдалося додати замовлення"));
  }
});

router.get("/orders/all", authenticate, async (req, res, next) => {
  try {
    const allOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        orderDate: orders.orderDate,
      })
      .from(orders);
    res.json(allOrders);
  } catch (error) {
    next(createError(500, "Не вдалося отримати всі замовлення"));
  }
});

// Оформлення замовлення
router.post("/orders/checkout", authenticate, async (req, res, next) => {
  const { orderId, deliveryAddress, telephone, paymentMethod } = req.body;

  if (!orderId || !deliveryAddress || !telephone || !paymentMethod) {
    return next(createError(400, "Усі поля обов'язкові"));
  }

  try {
    await db.transaction(async (tx) => {
      // Отримуємо товари в замовленні
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        const [size] = await tx
          .select()
          .from(productSizes)
          .where(
            and(
              eq(productSizes.articleNumber, item.articleNumber),
              eq(productSizes.size, item.size)
            )
          )
          .limit(1);

        if (!size || size.stock < item.quantity) {
          throw new Error(`Недостатньо запасів для розміру ${item.size}`);
        }

        const newStock = size.stock - item.quantity;
        if (newStock > 0) {
          await tx
            .update(productSizes)
            .set({ stock: newStock })
            .where(
              and(
                eq(productSizes.articleNumber, item.articleNumber),
                eq(productSizes.size, item.size)
              )
            );
        } else {
          await tx
            .delete(productSizes)
            .where(
              and(
                eq(productSizes.articleNumber, item.articleNumber),
                eq(productSizes.size, item.size)
              )
            );
        }
      }

      // Оновлюємо статус замовлення
      await tx
        .update(orders)
        .set({
          orderStatusId: 2, // "В обробці"
          deliveryAddress,
          telephone,
          paymentMethod,
        })
        .where(eq(orders.orderId, orderId));
    });

    res.json({ message: "Замовлення оформлено успішно" });
  } catch (error) {
    next(createError(500, error.message || "Не вдалося оформити замовлення"));
  }
});

// Скасування замовлення
router.post("/orders/cancel", authenticate, async (req, res, next) => {
  const { orderId } = req.body;

  if (!orderId) {
    return next(createError(400, "orderId є обов'язковим"));
  }

  try {
    await db.transaction(async (tx) => {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        const [size] = await tx
          .select()
          .from(productSizes)
          .where(
            and(
              eq(productSizes.articleNumber, item.articleNumber),
              eq(productSizes.size, item.size)
            )
          )
          .limit(1);

        if (size) {
          await tx
            .update(productSizes)
            .set({ stock: size.stock + item.quantity })
            .where(
              and(
                eq(productSizes.articleNumber, item.articleNumber),
                eq(productSizes.size, item.size)
              )
            );
        } else {
          await tx.insert(productSizes).values({
            articleNumber: item.articleNumber,
            size: item.size,
            stock: item.quantity,
          });
        }
      }

      await tx
        .update(orders)
        .set({ orderStatusId: 5 }) // "Скасовано"
        .where(eq(orders.orderId, orderId));
    });

    res.json({ message: "Замовлення скасовано успішно" });
  } catch (error) {
    next(createError(500, error.message || "Не вдалося скасувати замовлення"));
  }
});

router.post("/orders/guest-checkout", async (req, res) => {
  try {
    const {
      deliveryAddress,
      telephone,
      paymentMethod,
      cartItems,
      recaptchaToken,
    } = req.body;

    if (
      !deliveryAddress ||
      !telephone ||
      !paymentMethod ||
      !cartItems ||
      !recaptchaToken
    ) {
      return res
        .status(400)
        .json({ message: "Усі поля, включно з reCAPTCHA, обов'язкові" });
    }

    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaToken,
        },
      }
    );
    if (!response.data.success) {
      return res.status(400).json({ message: "Невдала перевірка reCAPTCHA" });
    }

    // Решта коду без змін
    const [newOrder] = await db
      .insert(orders)
      .values({
        userId: null,
        orderStatusId: 2,
        deliveryAddress,
        telephone,
        paymentMethod,
        orderDate: new Date(),
        lastUpdated: new Date(),
      })
      .returning({ orderId: orders.orderId });

    const orderId = newOrder.orderId;

    for (const item of cartItems) {
      const { articleNumber, size, quantity } = item;
      await db.insert(orderItems).values({
        orderId,
        articleNumber,
        size,
        quantity,
      });
    }

    res.status(201).json({
      message: "Замовлення оформлено успішно",
      orderId,
    });
  } catch (error) {
    console.error("Помилка оформлення замовлення для гостя:", error);
    res.status(500).json({ message: "Помилка оформлення замовлення" });
  }
});

router.get("/orders/history", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const userOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        orderDate: orders.orderDate,
      })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          or(
            eq(orders.orderStatusId, 2),
            eq(orders.orderStatusId, 3),
            eq(orders.orderStatusId, 4),
            eq(orders.orderStatusId, 5)
          )
        )
      );
    res.json(userOrders);
  } catch (error) {
    next(createError(500, "Не вдалося отримати історію замовлень"));
  }
});

router.post("/orders/update-status", authenticate, async (req, res, next) => {
  const { orderId, newStatus } = req.body;

  if (!orderId || !newStatus) {
    return next(createError(400, "orderId та newStatus обов'язкові"));
  }

  try {
    await db.transaction(async (tx) => {
      // Отримуємо поточний статус замовлення
      const order = await tx
        .select()
        .from(orders)
        .where(eq(orders.orderId, orderId))
        .limit(1);

      if (!order.length) {
        throw new Error("Замовлення не знайдено");
      }

      const currentStatus = order[0].orderStatusId;

      // Обробка зміни запасів при статусі "3 - Прийнято"
      if (newStatus === 3 && currentStatus !== 3) {
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId));

        for (const item of items) {
          const [sizeData] = await tx
            .select()
            .from(productSizes)
            .where(
              and(
                eq(productSizes.articleNumber, item.articleNumber),
                eq(productSizes.size, item.size)
              )
            )
            .limit(1);

          if (!sizeData) {
            throw new Error(
              `Розмір ${item.size} для товару ${item.articleNumber} не знайдено`
            );
          }

          const newStock = sizeData.stock - item.quantity;
          if (newStock < 0) {
            throw new Error(
              `Недостатньо запасів для товару ${item.articleNumber}, розмір ${item.size}`
            );
          }

          await tx
            .update(productSizes)
            .set({ stock: newStock })
            .where(
              and(
                eq(productSizes.articleNumber, item.articleNumber),
                eq(productSizes.size, item.size)
              )
            );
        }
      }
      // Обробка зміни запасів при статусі "6 - Скасовано"
      else if (newStatus === 6 && currentStatus !== 6) {
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId));

        for (const item of items) {
          const [sizeData] = await tx
            .select()
            .from(productSizes)
            .where(
              and(
                eq(productSizes.articleNumber, item.articleNumber),
                eq(productSizes.size, item.size)
              )
            )
            .limit(1);

          if (!sizeData) {
            await tx.insert(productSizes).values({
              articleNumber: item.articleNumber,
              size: item.size,
              stock: item.quantity,
            });
          } else {
            await tx
              .update(productSizes)
              .set({ stock: sizeData.stock + item.quantity })
              .where(
                and(
                  eq(productSizes.articleNumber, item.articleNumber),
                  eq(productSizes.size, item.size)
                )
              );
          }
        }
      }

      // Оновлюємо статус замовлення
      await tx
        .update(orders)
        .set({ orderStatusId: newStatus })
        .where(eq(orders.orderId, orderId));
    });

    res.json({ message: "Статус замовлення оновлено успішно" });
  } catch (error) {
    next(
      createError(500, error.message || "Не вдалося оновити статус замовлення")
    );
  }
});

export default router;
