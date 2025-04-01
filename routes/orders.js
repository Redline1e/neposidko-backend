import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { orders, orderItems, productSizes } from "../db/schema.js";
import { eq, or, and } from "drizzle-orm";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { fetchOne } from "../utils.js";

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

router.post("/orders/checkout", optionalAuth, async (req, res, next) => {
  try {
    const { deliveryAddress, telephone, paymentMethod, email, name } = req.body;
    if (!deliveryAddress || !telephone || (!req.user && (!email || !name))) {
      return next(createError(400, "Усі поля обов'язкові"));
    }

    let orderId;
    await db.transaction(async (tx) => {
      if (req.user) {
        const { userId } = req.user;
        const currentOrder = await fetchOne(
          tx
            .select({ orderId: orders.orderId })
            .from(orders)
            .where(and(eq(orders.userId, userId), eq(orders.orderStatusId, 1)))
            .limit(1)
        );
        if (!currentOrder) throw createError(404, "Активний кошик не знайдено");
        orderId = currentOrder.orderId;

        await tx
          .update(orders)
          .set({ orderStatusId: 2, deliveryAddress, telephone, paymentMethod })
          .where(eq(orders.orderId, orderId));
      } else {
        if (!req.session.cart || req.session.cart.length === 0)
          throw createError(400, "Кошик порожній");

        const [newOrder] = await tx
          .insert(orders)
          .values({
            userId: null,
            orderStatusId: 2,
            deliveryAddress,
            telephone,
            paymentMethod,
            email,
            name,
            lastUpdated: new Date(),
          })
          .returning({ orderId: orders.orderId });
        orderId = newOrder.orderId;

        for (const item of req.session.cart) {
          const { articleNumber, size, quantity } = item;
          const productSize = await tx
            .select()
            .from(productSizes)
            .where(
              and(
                eq(productSizes.articleNumber, articleNumber),
                eq(productSizes.size, size)
              )
            )
            .limit(1);
          if (productSize[0].stock < quantity) {
            throw createError(
              400,
              `Недостатньо товару ${articleNumber} розміру ${size}`
            );
          }
          await tx
            .insert(orderItems)
            .values({ orderId, articleNumber, size, quantity });
          await tx
            .update(productSizes)
            .set({ stock: productSize[0].stock - quantity })
            .where(
              and(
                eq(productSizes.articleNumber, articleNumber),
                eq(productSizes.size, size)
              )
            );
        }
        req.session.cart = [];
      }
    });

    res.json({ message: "Замовлення оформлено успішно", orderId });
  } catch (error) {
    next(error);
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

export default router;
