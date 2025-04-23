import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { db } from "./db/index.js";
import { orders } from "./db/schema.js";
import { and, eq, lt } from "drizzle-orm";
import usersRouter from "./routes/users.js";
import productsRouter from "./routes/products.js";
import categoriesRouter from "./routes/categories.js";
import brandsRouter from "./routes/brands.js";
import ordersRouter from "./routes/orders.js";
import orderItemsRouter from "./routes/orderItems.js";
import favoritesRouter from "./routes/favorites.js";
import reviewsRouter from "./routes/reviews.js";
import adminRouter from "./routes/admin.js";
import sizesRouter from "./routes/sizes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Налаштування CORS
app.use(
  cors({
    origin: process.env.FRONT_END_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // У продакшені встановіть secure: true з HTTPS
  })
);

app.use("/images", express.static(path.join(__dirname, "public", "images")));

// Монтування маршрутів
app.use(usersRouter);
app.use(productsRouter);
app.use(categoriesRouter);
app.use(brandsRouter);
app.use(ordersRouter);
app.use(orderItemsRouter);
app.use(favoritesRouter);
app.use(reviewsRouter);
app.use(sizesRouter);
app.use("/admin", adminRouter);

// Очищення старих кошиків щогодини
cron.schedule("0 * * * *", async () => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db
      .delete(orders)
      .where(
        and(
          eq(orders.orderStatusId, 1),
          lt(orders.lastUpdated, twentyFourHoursAgo)
        )
      );
    console.log("Старі кошики очищено");
  } catch (error) {
    console.error("Помилка очищення старих кошиків:", error);
  }
});

// Обробка помилок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Сталася внутрішня помилка сервера",
  });
});

app.listen(5000, () => {
  console.log("Сервер запущено на порту 5000");
});
