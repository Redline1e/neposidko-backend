import express from "express";
import createError from "http-errors";
import { db } from "../db/index.js";
import { orders, orderItems, products, productSizes } from "../db/schema.js";
import { eq, and, or, sql } from "drizzle-orm";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { fetchOne } from "../utils.js";

const router = express.Router();

router.get("/order-items/history", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const userOrderItems = await db
      .select({
        productOrderId: orderItems.productOrderId,
        orderId: orderItems.orderId,
        articleNumber: orderItems.articleNumber,
        size: orderItems.size,
        quantity: orderItems.quantity,
        name: products.name,
        imageUrls: products.imageUrls,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.orderId))
      .leftJoin(products, eq(orderItems.articleNumber, products.articleNumber))
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
    res.json(userOrderItems);
  } catch (error) {
    next(createError(500, "Не вдалося отримати позиції історії замовлень"));
  }
});

router.get("/order-items", optionalAuth, async (req, res, next) => {
  try {
    if (req.user) {
      const { userId } = req.user;
      const userOrderItems = await db
        .select({
          productOrderId: orderItems.productOrderId,
          orderId: orderItems.orderId,
          articleNumber: orderItems.articleNumber,
          size: orderItems.size,
          quantity: orderItems.quantity,
          name: products.name,
          imageUrls: products.imageUrls,
          price: products.price,
          discount: products.discount,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.orderId))
        .leftJoin(
          products,
          eq(orderItems.articleNumber, products.articleNumber)
        )
        .where(and(eq(orders.userId, userId), eq(orders.orderStatusId, 1)));
      return res.json(userOrderItems);
    } else {
      const sessionCart = req.session.cart || [];
      const cartWithDetails = await Promise.all(
        sessionCart.map(async (item) => {
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
              .where(eq(products.articleNumber, item.articleNumber))
              .limit(1)
          );
          return {
            ...item,
            name: product?.name || "Невідомий товар",
            imageUrls: product?.imageUrls || [],
            price: product?.price || 0,
            discount: product?.discount || 0,
          };
        })
      );
      return res.json(cartWithDetails);
    }
  } catch (error) {
    next(createError(500, "Не вдалося отримати позиції замовлення"));
  }
});

router.post("/order-items", optionalAuth, async (req, res, next) => {
  try {
    const { articleNumber, size, quantity } = req.body;
    if (!articleNumber || !size || quantity === undefined)
      return next(createError(400, "Усі поля обов'язкові"));

    // Перевіряємо запас для заданого розміру
    const productSize = await db
      .select()
      .from(productSizes)
      .where(
        and(
          eq(productSizes.articleNumber, articleNumber),
          eq(productSizes.size, size)
        )
      )
      .limit(1);
    if (!productSize.length)
      return next(createError(404, "Розмір не знайдено"));

    const availableStock = productSize[0].stock;

    if (req.user) {
      const { userId } = req.user;

      // Знаходимо поточний кошик (замовлення зі статусом 1)
      let currentOrder = await fetchOne(
        db
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(and(eq(orders.userId, userId), eq(orders.orderStatusId, 1)))
          .limit(1)
      );
      if (!currentOrder) {
        const newOrder = await db
          .insert(orders)
          .values({ userId, orderStatusId: 1, lastUpdated: new Date() })
          .returning({ orderId: orders.orderId });
        currentOrder = newOrder[0];
      } else {
        await db
          .update(orders)
          .set({ lastUpdated: new Date() })
          .where(eq(orders.orderId, currentOrder.orderId));
      }

      // Перевіряємо, чи є вже позиція з таким articleNumber та size
      const existingItem = await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, currentOrder.orderId),
            eq(orderItems.articleNumber, articleNumber),
            eq(orderItems.size, size)
          )
        )
        .limit(1);

      if (existingItem.length > 0) {
        // Оновлюємо кількість, якщо позиція вже є
        const currentQuantity = existingItem[0].quantity;
        const newQuantity = currentQuantity + quantity;

        if (newQuantity > availableStock) {
          return next(createError(400, "Недостатньо товару на складі"));
        }

        await db
          .update(orderItems)
          .set({ quantity: newQuantity })
          .where(eq(orderItems.productOrderId, existingItem[0].productOrderId));
        res.status(200).json({ message: "Кількість оновлено" });
      } else {
        // Додаємо нову позицію, якщо її немає
        if (quantity > availableStock) {
          return next(createError(400, "Недостатньо товару на складі"));
        }

        const newOrderItem = await db
          .insert(orderItems)
          .values({
            orderId: currentOrder.orderId,
            articleNumber,
            size,
            quantity,
          })
          .returning();
        res.status(201).json(newOrderItem[0]);
      }
    } else {
      // Логіка для неавторизованих користувачів (сесія)
      req.session.cart = req.session.cart || [];
      const cartItemIndex = req.session.cart.findIndex(
        (item) => item.articleNumber === articleNumber && item.size === size
      );

      if (cartItemIndex !== -1) {
        // Оновлюємо кількість у сесії
        const currentQuantity = req.session.cart[cartItemIndex].quantity;
        const newQuantity = currentQuantity + quantity;

        if (newQuantity > availableStock) {
          return next(createError(400, "Недостатньо товару на складі"));
        }

        req.session.cart[cartItemIndex].quantity = newQuantity;
        res.status(200).json({ message: "Кількість оновлено" });
      } else {
        // Додаємо нову позицію до сесії
        if (quantity > availableStock) {
          return next(createError(400, "Недостатньо товару на складі"));
        }

        req.session.cart.push({ articleNumber, size, quantity });
        res.status(201).json({ message: "Товар додано до кошика" });
      }
    }
  } catch (error) {
    next(createError(500, "Не вдалося додати товар до кошика"));
  }
});

router.put("/order-items/:id", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { size, quantity } = req.body;
    if (!size || !quantity)
      return next(createError(400, "Поля size та quantity обов'язкові"));
    const { userId } = req.user;

    const orderItemData = await fetchOne(
      db
        .select()
        .from(orderItems)
        .where(eq(orderItems.productOrderId, Number(id)))
        .limit(1)
    );
    if (!orderItemData)
      return next(createError(404, "Позицію замовлення не знайдено"));

    const orderData = await fetchOne(
      db.select().from(orders).where(eq(orders.orderId, orderItemData.orderId))
    );
    if (!orderData || orderData.userId !== userId)
      return next(createError(403, "Неавторизована дія"));

    const updatedOrderItems = await db
      .update(orderItems)
      .set({ size, quantity })
      .where(eq(orderItems.productOrderId, Number(id)))
      .returning();
    res.json(updatedOrderItems[0]);
  } catch (error) {
    next(createError(500, "Не вдалося оновити позицію замовлення"));
  }
});

router.delete("/order-items/:id", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const orderItemData = await fetchOne(
      db
        .select()
        .from(orderItems)
        .where(eq(orderItems.productOrderId, Number(id)))
        .limit(1)
    );
    if (!orderItemData)
      return next(createError(404, "Позицію замовлення не знайдено"));

    const orderData = await fetchOne(
      db.select().from(orders).where(eq(orders.orderId, orderItemData.orderId))
    );
    if (!orderData || orderData.userId !== userId)
      return next(createError(403, "Неавторизована дія"));

    await db
      .delete(orderItems)
      .where(eq(orderItems.productOrderId, Number(id)));

    const remainingItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderData.orderId));
    if (remainingItems.length === 0) {
      await db.delete(orders).where(eq(orders.orderId, orderData.orderId));
    } else {
      await db
        .update(orders)
        .set({ lastUpdated: new Date() })
        .where(eq(orders.orderId, orderData.orderId));
    }

    res.json({ message: "Позиція замовлення успішно видалена" });
  } catch (error) {
    next(createError(500, "Не вдалося видалити позицію замовлення"));
  }
});

router.get("/order-items/count", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.orderId))
      .where(and(eq(orders.userId, userId), eq(orders.orderStatusId, 1)));
    res.json({ count: Number(countResult[0].count) });
  } catch (error) {
    next(createError(500, "Не вдалося отримати кількість товарів у кошику"));
  }
});

export default router;
