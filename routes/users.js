import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import createError from "http-errors";
import { db } from "../db/index.js";
import { users, orders, orderItems, favorites } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { fetchOne } from "../utils.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", async (req, res, next) => {
  console.log("=== Початок маршруту /register ===");
  try {
    const { email, password, cart: clientCart, favorites: clientFavorites } = req.body;
    if (!email || !password) return next(createError(400, "Усі поля обов'язкові!"));

    const sanitizedEmail = email.trim().toLowerCase();
    const name = sanitizedEmail.split("@")[0];
    const existingUser = await fetchOne(
      db.select({ email: users.email }).from(users).where(eq(users.email, sanitizedEmail)).limit(1)
    );
    if (existingUser) return next(createError(409, "Користувач уже існує!"));

    const hashedPassword = await bcrypt.hash(password, 10);
    let newUser;

    await db.transaction(async (tx) => {
      const insertedUsers = await tx
        .insert(users)
        .values({ name, email: sanitizedEmail, password: hashedPassword, roleId: 2 })
        .returning({ userId: users.userId, name: users.name, email: users.email, roleId: users.roleId });
      newUser = insertedUsers[0];

      if (clientFavorites && Array.isArray(clientFavorites)) {
        for (const articleNumber of clientFavorites) {
          const exists = await tx
            .select()
            .from(favorites)
            .where(and(eq(favorites.userId, newUser.userId), eq(favorites.articleNumber, articleNumber)))
            .limit(1);
          if (!exists.length) {
            await tx.insert(favorites).values({ userId: newUser.userId, articleNumber });
          }
        }
      } else if (req.session.favorites?.length > 0) {
        for (const articleNumber of req.session.favorites) {
          const exists = await tx
            .select()
            .from(favorites)
            .where(and(eq(favorites.userId, newUser.userId), eq(favorites.articleNumber, articleNumber)))
            .limit(1);
          if (!exists.length) {
            await tx.insert(favorites).values({ userId: newUser.userId, articleNumber });
          }
        }
        req.session.favorites = [];
      }

      if (clientCart && Array.isArray(clientCart)) {
        let currentOrder = await tx
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(and(eq(orders.userId, newUser.userId), eq(orders.orderStatusId, 1)))
          .limit(1);
        if (!currentOrder.length) {
          const newOrder = await tx
            .insert(orders)
            .values({ userId: newUser.userId, orderStatusId: 1, lastUpdated: new Date() })
            .returning({ orderId: orders.orderId });
          currentOrder = newOrder;
        }
        for (const item of clientCart) {
          await tx.insert(orderItems).values({
            orderId: currentOrder[0].orderId,
            articleNumber: item.articleNumber,
            size: item.size,
            quantity: item.quantity,
          });
        }
      } else if (req.session.cart?.length > 0) {
        let currentOrder = await tx
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(and(eq(orders.userId, newUser.userId), eq(orders.orderStatusId, 1)))
          .limit(1);
        if (!currentOrder.length) {
          const newOrder = await tx
            .insert(orders)
            .values({ userId: newUser.userId, orderStatusId: 1, lastUpdated: new Date() })
            .returning({ orderId: orders.orderId });
          currentOrder = newOrder;
        }
        for (const item of req.session.cart) {
          await tx.insert(orderItems).values({
            orderId: currentOrder[0].orderId,
            articleNumber: item.articleNumber,
            size: item.size,
            quantity: item.quantity,
          });
        }
        req.session.cart = [];
      }
    });

    const token = jwt.sign({ userId: newUser.userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.status(201).json({ ...newUser, token });
  } catch (error) {
    console.error("Помилка реєстрації:", error);
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  console.log("=== Початок маршруту /login ===");
  try {
    const { email, password, cart: clientCart, favorites: clientFavorites } = req.body;
    if (!email || !password) return next(createError(400, "Усі поля обов'язкові!"));

    const sanitizedEmail = email.trim().toLowerCase();
    const user = await fetchOne(
      db.select({ userId: users.userId, password: users.password }).from(users).where(eq(users.email, sanitizedEmail)).limit(1)
    );
    if (!user) return next(createError(404, "Користувача не знайдено!"));

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return next(createError(401, "Невірний пароль!"));

    await db.transaction(async (tx) => {
      if (clientFavorites && Array.isArray(clientFavorites)) {
        for (const articleNumber of clientFavorites) {
          const exists = await tx
            .select()
            .from(favorites)
            .where(and(eq(favorites.userId, user.userId), eq(favorites.articleNumber, articleNumber)))
            .limit(1);
          if (!exists.length) {
            await tx.insert(favorites).values({ userId: user.userId, articleNumber });
          }
        }
      } else if (req.session.favorites?.length > 0) {
        for (const articleNumber of req.session.favorites) {
          const exists = await tx
            .select()
            .from(favorites)
            .where(and(eq(favorites.userId, user.userId), eq(favorites.articleNumber, articleNumber)))
            .limit(1);
          if (!exists.length) {
            await tx.insert(favorites).values({ userId: user.userId, articleNumber });
          }
        }
        req.session.favorites = [];
      }

      if (clientCart && Array.isArray(clientCart)) {
        let currentOrder = await tx
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(and(eq(orders.userId, user.userId), eq(orders.orderStatusId, 1)))
          .limit(1);
        if (!currentOrder.length) {
          const newOrder = await tx
            .insert(orders)
            .values({ userId: user.userId, orderStatusId: 1, lastUpdated: new Date() })
            .returning({ orderId: orders.orderId });
          currentOrder = newOrder;
        }
        for (const item of clientCart) {
          await tx.insert(orderItems).values({
            orderId: currentOrder[0].orderId,
            articleNumber: item.articleNumber,
            size: item.size,
            quantity: item.quantity,
          });
        }
      } else if (req.session.cart?.length > 0) {
        let currentOrder = await tx
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(and(eq(orders.userId, user.userId), eq(orders.orderStatusId, 1)))
          .limit(1);
        if (!currentOrder.length) {
          const newOrder = await tx
            .insert(orders)
            .values({ userId: user.userId, orderStatusId: 1, lastUpdated: new Date() })
            .returning({ orderId: orders.orderId });
          currentOrder = newOrder;
        }
        for (const item of req.session.cart) {
          await tx.insert(orderItems).values({
            orderId: currentOrder[0].orderId,
            articleNumber: item.articleNumber,
            size: item.size,
            quantity: item.quantity,
          });
        }
        req.session.cart = [];
      }
    });

    const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
  } catch (error) {
    console.error("Помилка авторизації:", error);
    next(error);
  }
});

router.get("/protected", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const user = await fetchOne(
      db
        .select({
          userId: users.userId,
          name: users.name,
          email: users.email,
          telephone: users.telephone,
          deliveryAddress: users.deliveryAddress,
        })
        .from(users)
        .where(eq(users.userId, userId))
        .limit(1)
    );
    if (!user) return next(createError(404, "Користувача не знайдено"));
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.put("/user", authenticate, async (req, res, next) => {
  try {
    const { name, email, telephone, deliveryAddress } = req.body;
    if (!name || !email) return next(createError(400, "Ім'я та email обов'язкові!"));
    const { userId } = req.user;
    const updatedUsers = await db
      .update(users)
      .set({ name, email, telephone, deliveryAddress })
      .where(eq(users.userId, userId))
      .returning({
        userId: users.userId,
        name: users.name,
        email: users.email,
        telephone: users.telephone,
        deliveryAddress: users.deliveryAddress,
        roleId: users.roleId,
      });
    if (!updatedUsers.length) return next(createError(500, "Не вдалося оновити користувача"));
    res.json(updatedUsers[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/user", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const deletedUser = await db
      .delete(users)
      .where(eq(users.userId, userId))
      .returning();
    if (!deletedUser.length) return next(createError(404, "Користувача не знайдено"));
    res.json({ message: "Користувача успішно видалено" });
  } catch (error) {
    next(error);
  }
});

router.get("/getUserRole", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const user = await fetchOne(
      db.select({ roleId: users.roleId }).from(users).where(eq(users.userId, userId)).limit(1)
    );
    if (!user) return next(createError(404, "Користувача не знайдено"));
    res.json({ roleId: user.roleId });
  } catch (error) {
    next(error);
  }
});

router.get("/user/:userId", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await fetchOne(
      db
        .select({
          userId: users.userId,
          name: users.name,
          email: users.email,
          telephone: users.telephone,
          deliveryAddress: users.deliveryAddress,
          roleId: users.roleId,
        })
        .from(users)
        .where(eq(users.userId, Number(userId)))
        .limit(1)
    );
    if (!user) return next(createError(404, "Користувача не знайдено"));
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

export default router;