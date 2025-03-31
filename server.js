import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import createError from "http-errors";
import path from "path";
import fs from "fs/promises";
import multer from "multer";
import { db } from "./db/index.js";
import { eq, ilike, and, or, lt, gt, sql } from "drizzle-orm";
import { fileURLToPath } from "url";
import { authenticate } from "./middleware/auth.js";
import cron from "node-cron";
import xlsx from "xlsx";
import session from "express-session";
import {
  products,
  users,
  brands,
  categories,
  orders,
  orderItems,
  productSizes,
  favorites,
  reviews,
  productCategories,
  orderStatus,
} from "./db/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_DIR = path.join(__dirname, "public", "images");

dotenv.config();
const app = express();

app.use(
  cors({
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key", // Додай секрет у .env
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // У продакшені встанови secure: true з HTTPS
  })
);
app.use("/images", express.static(path.join(__dirname, "public", "images")));

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { userId: decoded.userId };
    } catch (error) {
      // Якщо токен недійсний, продовжуємо як гість.
    }
  }
  next();
};

// Допоміжна функція для отримання першого результату запиту
const fetchOne = async (query) => {
  const results = await query;
  return results[0];
};

// Налаштування Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGE_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Дозволені тільки зображення"));
  },
});

const deleteFiles = async (filesOrUrls) => {
  const files = Array.isArray(filesOrUrls)
    ? filesOrUrls.map((file) => file.filename || path.basename(file))
    : [filesOrUrls.filename || path.basename(filesOrUrls)];
  const deletePromises = files.map((filename) =>
    fs
      .unlink(path.join(IMAGE_DIR, filename))
      .catch((err) =>
        console.error(`Помилка видалення файлу ${filename}:`, err)
      )
  );
  await Promise.all(deletePromises);
};
//-------------------------------------------------------USERS----------------------------------------------------------------------

app.post("/register", async (req, res, next) => {
  console.log("=== Початок маршруту /register ===");

  try {
    // Додатково отримуємо дані кошика та favorites, які передаються з клієнта (з localStorage)
    const {
      email,
      password,
      cart: clientCart,
      favorites: clientFavorites,
    } = req.body;
    if (!email || !password) {
      console.log("Лог: Відсутній email або пароль");
      return next(createError(400, "Усі поля обов'язкові!"));
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const name = sanitizedEmail.split("@")[0];

    // Перевірка чи користувач з таким email вже існує
    const existingUser = await fetchOne(
      db
        .select({ email: users.email, userId: users.userId })
        .from(users)
        .where(eq(users.email, sanitizedEmail))
        .limit(1)
    );

    if (existingUser) {
      console.log("Лог: Користувач вже існує:", sanitizedEmail);
      return next(createError(409, "Користувач вже існує!"));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertedUsers = await db
      .insert(users)
      .values({
        name,
        email: sanitizedEmail,
        password: hashedPassword,
        roleId: 2, // звичайний користувач
      })
      .returning({
        userId: users.userId,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
      });

    if (!insertedUsers || insertedUsers.length === 0) {
      console.log("Лог: Помилка вставлення користувача");
      return next(createError(500, "Не вдалося створити користувача"));
    }

    const newUser = insertedUsers[0];
    console.log("Лог: Новий користувач створено", newUser);

    // ===== Міграція favorites =====
    if (
      clientFavorites &&
      Array.isArray(clientFavorites) &&
      clientFavorites.length > 0
    ) {
      console.log("Лог: Початок міграції favorites з req.body");
      for (const articleNumber of clientFavorites) {
        const existingFavorite = await fetchOne(
          db
            .select()
            .from(favorites)
            .where(
              and(
                eq(favorites.userId, newUser.userId),
                eq(favorites.articleNumber, articleNumber)
              )
            )
            .limit(1)
        );
        if (!existingFavorite) {
          console.log(`Лог: Додавання favorites ${articleNumber} з req.body`);
          await db.insert(favorites).values({
            userId: newUser.userId,
            articleNumber,
          });
        } else {
          console.log(`Лог: Товар ${articleNumber} вже існує в favorites`);
        }
      }
    } else if (req.session.favorites && req.session.favorites.length > 0) {
      console.log("Лог: Початок міграції favorites з req.session");
      for (const articleNumber of req.session.favorites) {
        const existingFavorite = await fetchOne(
          db
            .select()
            .from(favorites)
            .where(
              and(
                eq(favorites.userId, newUser.userId),
                eq(favorites.articleNumber, articleNumber)
              )
            )
            .limit(1)
        );
        if (!existingFavorite) {
          console.log(
            `Лог: Додавання favorites ${articleNumber} з req.session`
          );
          await db
            .insert(favorites)
            .values({ userId: newUser.userId, articleNumber });
        } else {
          console.log(
            `Лог: Товар ${articleNumber} вже існує в favorites (req.session)`
          );
        }
      }
      req.session.favorites = [];
    } else {
      console.log("Лог: Немає favorites для міграції");
    }

    // ===== Міграція кошика (cart) =====
    if (clientCart && Array.isArray(clientCart) && clientCart.length > 0) {
      console.log("Лог: Початок міграції кошика з req.body");
      let currentOrder = await fetchOne(
        db
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(
            and(
              eq(orders.userId, newUser.userId),
              eq(orders.orderStatusId, 1) // активний кошик
            )
          )
          .limit(1)
      );
      if (!currentOrder) {
        console.log("Лог: Активний кошик не знайдено, створюємо новий");
        const newOrder = await db
          .insert(orders)
          .values({
            userId: newUser.userId,
            orderStatusId: 1,
            lastUpdated: new Date(),
          })
          .returning({ orderId: orders.orderId });
        currentOrder = newOrder[0];
      }
      for (const item of clientCart) {
        console.log("Лог: Додавання товару до кошика з req.body", item);
        await db.insert(orderItems).values({
          orderId: currentOrder.orderId,
          articleNumber: item.articleNumber,
          size: item.size,
          quantity: item.quantity,
        });
      }
    } else if (req.session.cart && req.session.cart.length > 0) {
      console.log("Лог: Початок міграції кошика з req.session");
      let currentOrder = await fetchOne(
        db
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(
            and(eq(orders.userId, newUser.userId), eq(orders.orderStatusId, 1))
          )
          .limit(1)
      );
      if (!currentOrder) {
        console.log(
          "Лог: Активний кошик не знайдено (req.session), створюємо новий"
        );
        const newOrder = await db
          .insert(orders)
          .values({
            userId: newUser.userId,
            orderStatusId: 1,
            lastUpdated: new Date(),
          })
          .returning({ orderId: orders.orderId });
        currentOrder = newOrder[0];
      }
      for (const item of req.session.cart) {
        console.log("Лог: Додавання товару до кошика з req.session", item);
        await db.insert(orderItems).values({
          orderId: currentOrder.orderId,
          articleNumber: item.articleNumber,
          size: item.size,
          quantity: item.quantity,
        });
      }
      req.session.cart = [];
    } else {
      console.log("Лог: Немає даних кошика для міграції");
    }

    const token = jwt.sign({ userId: newUser.userId }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    console.log("Лог: Реєстрація успішна, генеруємо токен");
    res.status(201).json({
      userId: newUser.userId,
      name: newUser.name,
      email: newUser.email,
      roleId: newUser.roleId,
      token,
    });
  } catch (error) {
    console.error("Помилка реєстрації:", error);
    next(error);
  }

  console.log("=== Кінець маршруту /register ===");
});

app.post("/login", async (req, res, next) => {
  console.log("=== Початок маршруту /login ===");
  try {
    // Додатково отримуємо дані кошика та улюблених з запиту,
    // які передаються з клієнта (з localStorage)
    const {
      email,
      password,
      cart: clientCart,
      favorites: clientFavorites,
    } = req.body;
    if (!email || !password) {
      console.log("Лог: Відсутній email або пароль");
      return next(createError(400, "Усі поля обов'язкові!"));
    }
    console.log("Лог: Email та пароль отримані, email:", email);

    const sanitizedEmail = email.trim().toLowerCase();
    const user = await fetchOne(
      db
        .select({
          userId: users.userId,
          email: users.email,
          password: users.password,
        })
        .from(users)
        .where(eq(users.email, sanitizedEmail))
        .limit(1)
    );

    if (!user) {
      console.log(`Лог: Користувача з email ${sanitizedEmail} не знайдено`);
      return next(createError(404, "Користувача не знайдено!"));
    }
    console.log("Лог: Користувач знайдений", user);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log("Лог: Невірний пароль");
      return next(createError(401, "Невірний пароль!"));
    }
    console.log("Лог: Пароль успішно перевірено");

    // === Синхронізація favorites ===
    if (
      clientFavorites &&
      Array.isArray(clientFavorites) &&
      clientFavorites.length > 0
    ) {
      console.log("Лог: Початок міграції favorites з req.body");
      for (const articleNumber of clientFavorites) {
        const existingFavorite = await fetchOne(
          db
            .select()
            .from(favorites)
            .where(
              and(
                eq(favorites.userId, user.userId),
                eq(favorites.articleNumber, articleNumber)
              )
            )
        );
        if (!existingFavorite) {
          console.log(
            `Лог: Додавання улюбленого товару ${articleNumber} з req.body`
          );
          await db.insert(favorites).values({
            userId: user.userId,
            articleNumber,
          });
        } else {
          console.log(`Лог: Товар ${articleNumber} вже існує в favorites`);
        }
      }
    } else if (req.session.favorites && req.session.favorites.length > 0) {
      console.log("Лог: Початок міграції favorites з req.session");
      for (const articleNumber of req.session.favorites) {
        const existingFavorite = await fetchOne(
          db
            .select()
            .from(favorites)
            .where(
              and(
                eq(favorites.userId, user.userId),
                eq(favorites.articleNumber, articleNumber)
              )
            )
        );
        if (!existingFavorite) {
          console.log(
            `Лог: Додавання улюбленого товару ${articleNumber} з req.session`
          );
          await db.insert(favorites).values({
            userId: user.userId,
            articleNumber,
          });
        } else {
          console.log(`Лог: Товар ${articleNumber} вже існує в favorites`);
        }
      }
      req.session.favorites = [];
    } else {
      console.log("Лог: Немає favorites для міграції");
    }

    // === Синхронізація кошика (cart) ===
    if (clientCart && Array.isArray(clientCart) && clientCart.length > 0) {
      console.log("Лог: Початок міграції кошика з req.body");
      let currentOrder = await fetchOne(
        db
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(
            and(
              eq(orders.userId, user.userId),
              eq(orders.orderStatusId, 1) // Активний кошик
            )
          )
      );
      if (!currentOrder) {
        console.log("Лог: Активний кошик не знайдено, створюємо новий");
        const newOrder = await db
          .insert(orders)
          .values({
            userId: user.userId,
            orderStatusId: 1,
            lastUpdated: new Date(),
          })
          .returning({ orderId: orders.orderId });
        currentOrder = newOrder[0];
      }
      for (const item of clientCart) {
        console.log("Лог: Додавання товару до кошика з req.body", item);
        await db.insert(orderItems).values({
          orderId: currentOrder.orderId,
          articleNumber: item.articleNumber,
          size: item.size,
          quantity: item.quantity,
        });
      }
    } else if (req.session.cart && req.session.cart.length > 0) {
      console.log("Лог: Початок міграції кошика з req.session");
      let currentOrder = await fetchOne(
        db
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(
            and(eq(orders.userId, user.userId), eq(orders.orderStatusId, 1))
          )
      );
      if (!currentOrder) {
        console.log("Лог: Активний кошик не знайдено, створюємо новий");
        const newOrder = await db
          .insert(orders)
          .values({
            userId: user.userId,
            orderStatusId: 1,
            lastUpdated: new Date(),
          })
          .returning({ orderId: orders.orderId });
        currentOrder = newOrder[0];
      }
      for (const item of req.session.cart) {
        console.log("Лог: Додавання товару до кошика з req.session", item);
        await db.insert(orderItems).values({
          orderId: currentOrder.orderId,
          articleNumber: item.articleNumber,
          size: item.size,
          quantity: item.quantity,
        });
      }
      req.session.cart = [];
    } else {
      console.log("Лог: Немає даних кошика для міграції");
    }

    // Генерація токена
    const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    console.log("Лог: Авторизація успішна, генеруємо токен");
    res.json({ token });
  } catch (error) {
    console.error("Помилка в маршруті /login:", error);
    next(error);
  }
  console.log("=== Кінець маршруту /login ===");
});

app.get("/protected", authenticate, async (req, res, next) => {
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

    if (!user) {
      return next(createError(404, "Користувач не знайдений"));
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Помилка отримання даних користувача:", error);
    next(error);
  }
});

app.put("/user", authenticate, async (req, res, next) => {
  try {
    const { name, email, telephone, deliveryAddress } = req.body;
    if (!name || !email) {
      return next(createError(400, "Ім'я та електронна пошта обов'язкові!"));
    }

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

    if (!updatedUsers || updatedUsers.length === 0) {
      return next(createError(500, "Не вдалося оновити користувача"));
    }

    res.json(updatedUsers[0]);
  } catch (error) {
    console.error("Помилка оновлення користувача:", error);
    next(error);
  }
});

app.delete("/user", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const deletedUser = await db
      .delete(users)
      .where(eq(users.userId, userId))
      .returning();

    if (!deletedUser || deletedUser.length === 0) {
      return next(createError(404, "Користувач не знайдений"));
    }

    res.json({ message: "Користувача успішно видалено" });
  } catch (error) {
    console.error("Не вдалося видалити користувача:", error);
    next(error);
  }
});

app.get("/getUserRole", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const user = await fetchOne(
      db
        .select({ roleId: users.roleId })
        .from(users)
        .where(eq(users.userId, userId))
        .limit(1)
    );

    if (!user) {
      return next(createError(404, "Користувач не знайдений"));
    }

    res.json({ roleId: user.roleId });
  } catch (error) {
    console.error("Помилка отримання ролі користувача:", error);
    next(error);
  }
});

app.get("/user/:userId", authenticate, async (req, res, next) => {
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

    if (!user) {
      return next(createError(404, "Користувача не знайдено"));
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Помилка отримання користувача за ID:", error);
    next(error);
  }
});

//-------------------------------------------------------PRODUCTS----------------------------------------------------------------------

app.get("/products", async (req, res, next) => {
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

    // Отримання розмірів для кожного товару
    const productsWithSizes = await Promise.all(
      allProducts.map(async (prod) => {
        const sizes = await db
          .select({
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(eq(productSizes.articleNumber, prod.articleNumber));
        return { ...prod, sizes };
      })
    );

    res.json(productsWithSizes);
  } catch (error) {
    console.error("Error fetching products:", error);
    next(createError(500, "Failed to fetch products"));
  }
});

app.post("/products", upload.array("images"), async (req, res, next) => {
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
      return next(
        createError(
          400,
          "Поля articleNumber, brandId, categoryId, price, name, description є обов'язковими"
        )
      );
    }
    if (!files || files.length === 0) {
      return next(
        createError(400, "Потрібно завантажити хоча б одне зображення")
      );
    }

    // Перевірка на унікальність articleNumber
    const existingProduct = await db
      .select()
      .from(products)
      .where(eq(products.articleNumber, articleNumber))
      .limit(1);
    if (existingProduct.length > 0) {
      return next(createError(409, "Товар з таким articleNumber уже існує"));
    }

    const imageUrls = files.map(
      (file) => `${req.protocol}://${req.get("host")}/images/${file.filename}`
    );

    const [newProduct] = await db
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

    const categoryImageUrl = imageUrls[0];
    await db.insert(productCategories).values({
      articleNumber,
      categoryId: Number(categoryId),
      imageUrl: categoryImageUrl,
    });

    const parsedSizes = sizes ? JSON.parse(sizes) : [];
    if (Array.isArray(parsedSizes)) {
      for (const sizeObj of parsedSizes) {
        const { size, stock } = sizeObj;
        if (!size || stock == null) continue;
        await db.insert(productSizes).values({
          articleNumber,
          size,
          stock: Number(stock),
        });
      }
    }

    res.status(201).json(newProduct);
  } catch (error) {
    if (req.files && Array.isArray(req.files)) {
      await deleteFiles(req.files);
    }
    console.error("Error adding product:", error);
    next(createError(500, "Не вдалося додати продукт"));
  }
});

app.get("/products/active", async (req, res, next) => {
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

    const productsWithSizes = await Promise.all(
      activeProducts.map(async (prod) => {
        const sizes = await db
          .select({
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(eq(productSizes.articleNumber, prod.articleNumber));
        return { ...prod, sizes };
      })
    );

    res.json(productsWithSizes);
  } catch (error) {
    console.error("Error fetching active products:", error);
    next(createError(500, "Failed to fetch active products"));
  }
});
// Ендпоінт для отримання неактивних продуктів (isActive: false)
app.get("/products/inactive", async (req, res, next) => {
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
        category: categories.name,
        categoryId: categories.categoryId,
        isActive: products.isActive, // Додаємо поле isActive
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

    const productsWithSizes = await Promise.all(
      inactiveProducts.map(async (prod) => {
        const sizes = await db
          .select({
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(eq(productSizes.articleNumber, prod.articleNumber));
        return { ...prod, sizes };
      })
    );

    res.json(productsWithSizes);
  } catch (error) {
    console.error("Error fetching inactive products:", error);
    next(createError(500, "Failed to fetch inactive products"));
  }
});

// Ендпоінт для зміни параметра isActive продукту
app.patch("/product/:articleNumber/active", async (req, res, next) => {
  try {
    const { articleNumber } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return next(createError(400, "Поле isActive має бути булевим значенням"));
    }

    const [updatedProduct] = await db
      .update(products)
      .set({ isActive })
      .where(eq(products.articleNumber, articleNumber))
      .returning();

    if (!updatedProduct) {
      return next(createError(404, "Продукт не знайдено"));
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error("Error updating product isActive:", error);
    next(createError(500, "Не вдалося оновити статус продукту"));
  }
});

app.get("/product/:articleNumber", async (req, res, next) => {
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
          isActive: products.isActive, // переконайтеся, що це поле вибирається
        })
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.brandId))
        .where(eq(products.articleNumber, articleNumber))
        .limit(1)
    );

    if (!product || !product.isActive) {
      return next(createError(404, "Продукт не знайдено"));
    }

    const sizes = await db
      .select({
        size: productSizes.size,
        stock: productSizes.stock,
      })
      .from(productSizes)
      .where(eq(productSizes.articleNumber, articleNumber));

    res.json({ ...product, sizes });
  } catch (error) {
    console.error("Error fetching product by articleNumber:", error);
    next(createError(500, "Не вдалося отримати дані продукту"));
  }
});

app.put(
  "/product/:articleNumber",
  upload.array("images"),
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
      if (imagesToDelete.length > 0) {
        await deleteFiles(imagesToDelete);
      }

      const updatedFields = {
        brandId: Number(req.body.brandId),
        price: Number(req.body.price),
        discount: Number(req.body.discount),
        name: req.body.name,
        description: req.body.description,
        imageUrls: finalImageUrls,
      };

      const [updatedProduct] = await db
        .update(products)
        .set(updatedFields)
        .where(eq(products.articleNumber, articleNumber))
        .returning();

      if (!updatedProduct) {
        return next(createError(404, "Продукт не знайдено"));
      }

      // Оновлення розмірів: видаляємо старі, додаємо нові
      const sizes = req.body.sizes ? JSON.parse(req.body.sizes) : [];
      if (Array.isArray(sizes)) {
        await db
          .delete(productSizes)
          .where(eq(productSizes.articleNumber, articleNumber));
        for (const sizeObj of sizes) {
          const { size, stock } = sizeObj;
          if (size && stock != null) {
            await db.insert(productSizes).values({
              articleNumber,
              size,
              stock: Number(stock),
            });
          }
        }
      }

      res.json(updatedProduct);
    } catch (error) {
      console.error("Помилка оновлення продукту:", error);
      next(createError(500, "Не вдалося оновити продукт"));
    }
  }
);
app.delete("/product/:articleNumber", async (req, res, next) => {
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
    console.error("Помилка видалення продукту:", error);
    next(createError(500, "Не вдалося видалити продукт"));
  }
});

app.get("/search", async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return next(createError(400, "Будь ласка, вкажіть параметр пошуку (q)"));
    }

    const productsList = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
        isActive: products.isActive, // Додаємо поле isActive
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .where(
        or(
          ilike(products.name, `%${q}%`),
          ilike(products.articleNumber, `%${q}%`)
        )
      ); // Прибираємо умову eq(products.isActive, true)

    const productsWithSizes = await Promise.all(
      productsList.map(async (product) => {
        const sizes = await db
          .select({
            size: productSizes.size,
            stock: productSizes.stock,
          })
          .from(productSizes)
          .where(eq(productSizes.articleNumber, product.articleNumber));
        return { ...product, sizes };
      })
    );

    res.json(productsWithSizes);
  } catch (error) {
    console.error("Помилка при пошуку товарів:", error);
    next(createError(500, "Внутрішня помилка сервера"));
  }
});

//-------------------------------------------------------CATEGORIES----------------------------------------------------------------------

app.get("/categories", async (req, res, next) => {
  try {
    const allCategories = await db
      .select({
        categoryId: categories.categoryId,
        name: categories.name,
        imageUrl: categories.imageUrl,
      })
      .from(categories);

    // Перетворюємо null на "" перед відправкою
    const sanitizedCategories = allCategories.map((category) => ({
      ...category,
      imageUrl: category.imageUrl ?? "",
    }));

    res.json(sanitizedCategories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    next(createError(500, "Failed to fetch categories"));
  }
});

app.post("/categories", upload.single("image"), async (req, res, next) => {
  try {
    const { name } = req.body;
    const file = req.file;

    if (!name) return next(createError(400, "Назва категорії обов'язкова"));
    if (!file) return next(createError(400, "Зображення обов'язкове"));

    const imageUrl = `${req.protocol}://${req.get("host")}/images/${
      file.filename
    }`;
    const [newCategory] = await db
      .insert(categories)
      .values({ name, imageUrl })
      .returning();

    res.status(201).json(newCategory);
  } catch (error) {
    if (req.file) await deleteFiles([req.file]);
    console.error("Помилка додавання категорії:", error);
    next(createError(500, "Не вдалося додати категорію"));
  }
});

app.put(
  "/categories/:categoryId",
  upload.single("image"),
  async (req, res, next) => {
    try {
      const { categoryId } = req.params;
      const { name } = req.body;
      const file = req.file;

      if (!name) {
        return next(createError(400, "Поле назви категорії є обов'язковим"));
      }

      let imageUrl;
      if (file) {
        imageUrl = `${req.protocol}://${req.get("host")}/images/${
          file.filename
        }`;
      } else {
        const existingCategory = await fetchOne(
          db
            .select({ imageUrl: categories.imageUrl })
            .from(categories)
            .where(eq(categories.categoryId, Number(categoryId)))
        );
        if (!existingCategory) {
          return next(createError(404, "Категорію не знайдено"));
        }
        imageUrl = existingCategory.imageUrl;
      }

      const [updatedCategory] = await db
        .update(categories)
        .set({ name, imageUrl })
        .where(eq(categories.categoryId, Number(categoryId)))
        .returning();

      if (!updatedCategory) {
        return next(createError(404, "Категорію не знайдено"));
      }

      res.json(updatedCategory);
    } catch (error) {
      if (req.file) {
        await deleteFiles([req.file]);
      }
      console.error("Error updating category:", error);
      next(createError(500, "Не вдалося оновити категорію"));
    }
  }
);

app.delete("/categories/:categoryId", async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const category = await fetchOne(
      db
        .select({ imageUrl: categories.imageUrl })
        .from(categories)
        .where(eq(categories.categoryId, Number(categoryId)))
    );

    if (!category) return next(createError(404, "Категорію не знайдено"));

    if (category.imageUrl) await deleteFiles([category.imageUrl]);

    const deleted = await db
      .delete(categories)
      .where(eq(categories.categoryId, Number(categoryId)))
      .returning();
    if (!deleted.length) return next(createError(404, "Категорію не знайдено"));

    res.json({ message: "Категорія успішно видалена" });
  } catch (error) {
    console.error("Помилка видалення категорії:", error);
    next(createError(500, "Не вдалося видалити категорію"));
  }
});
//-------------------------------------------------------BRANDS----------------------------------------------------------------------

app.get("/brands", async (req, res, next) => {
  try {
    const allBrands = await db
      .select({
        brandId: brands.brandId,
        name: brands.name,
      })
      .from(brands);

    res.json(allBrands);
  } catch (error) {
    console.error("Error fetching brands:", error);
    next(createError(500, "Failed to fetch brands"));
  }
});

app.post("/brands", async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      return next(createError(400, "Поле назви є обов'язкове"));
    }

    const [newBrand] = await db.insert(brands).values({ name }).returning();

    res.status(201).json(newBrand);
  } catch (error) {
    console.error("Error adding brand:", error);
    next(createError(500, "Error adding brand"));
  }
});

app.get("/brand/:brandId", async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const brand = await fetchOne(
      db
        .select({ name: brands.name })
        .from(brands)
        .where(eq(brands.brandId, Number(brandId)))
        .limit(1)
    );

    if (!brand) {
      return next(createError(404, "Бренд не знайдено"));
    }

    res.json({ brand });
  } catch (error) {
    console.error("Помилка отримання бренду за brandId:", error);
    next(createError(500, "Не вдалося отримати дані бренду"));
  }
});

app.put("/brand/:brandId", async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const { name } = req.body;

    if (!name) {
      return next(createError(400, "Поле назви бренду є обов'язковим"));
    }

    const [updatedBrand] = await db
      .update(brands)
      .set({ name })
      .where(eq(brands.brandId, Number(brandId)))
      .returning();

    if (!updatedBrand) {
      return next(createError(404, "Бренд не знайдено"));
    }

    res.json(updatedBrand);
  } catch (error) {
    console.error("Error updating brand:", error);
    next(createError(500, "Не вдалося оновити бренд"));
  }
});

app.delete("/brand/:brandId", async (req, res, next) => {
  try {
    const { brandId } = req.params;

    const deleted = await db
      .delete(brands)
      .where(eq(brands.brandId, Number(brandId)))
      .returning();

    if (deleted.length === 0) {
      return next(createError(404, "Бренд не знайдено"));
    }

    res.json({ message: "Бренд успішно видалено" });
  } catch (error) {
    console.error("Error deleting brand:", error);
    next(createError(500, "Не вдалося видалити бренд"));
  }
});

//-------------------------------------------------------ORDERS----------------------------------------------------------------------

app.get("/orders", authenticate, async (req, res, next) => {
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
    console.error("Error fetching orders:", error);
    next(createError(500, "Failed to fetch orders"));
  }
});

// POST /orders – створення нового замовлення
app.post("/orders", authenticate, async (req, res, next) => {
  try {
    const { orderStatusId } = req.body;
    const { userId } = req.user;
    const [newOrder] = await db
      .insert(orders)
      .values({ userId, orderStatusId })
      .returning();
    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error adding order:", error);
    next(createError(500, "Error adding order"));
  }
});
// GET /orders/all – отримання усіх замовлень незалежно від аккаунту
app.get("/orders/all", async (req, res, next) => {
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
    console.error("Error fetching all orders:", error);
    next(createError(500, "Не вдалося завантажити всі замовлення"));
  }
});

app.post("/orders/checkout", optionalAuth, async (req, res, next) => {
  try {
    const { deliveryAddress, telephone, paymentMethod, email, name } = req.body;

    // Для гостей перевіряємо наявність email та name,
    // для авторизованих – ці дані беремо з профілю (req.user)
    if (!deliveryAddress || !telephone || (!req.user && (!email || !name))) {
      return next(
        createError(
          400,
          "deliveryAddress, telephone, email та name є обов'язковими"
        )
      );
    }

    let orderId;

    await db.transaction(async (tx) => {
      if (req.user) {
        // Для авторизованих користувачів беремо userId з req.user
        const { userId } = req.user;
        const currentOrder = await fetchOne(
          tx
            .select({ orderId: orders.orderId })
            .from(orders)
            .where(and(eq(orders.userId, userId), eq(orders.orderStatusId, 1)))
            .limit(1)
        );

        if (!currentOrder) {
          throw createError(404, "Активний кошик не знайдено");
        }
        orderId = currentOrder.orderId;

        // Оновлюємо замовлення; email та name беремо із профілю, тому їх тут не використовуємо
        await tx
          .update(orders)
          .set({
            orderStatusId: 2,
            deliveryAddress,
            telephone,
            paymentMethod,
          })
          .where(eq(orders.orderId, orderId));
      } else {
        // Для гостей email та name обов’язкові (вони передаються в тілі запиту)
        if (!req.session.cart || req.session.cart.length === 0) {
          throw createError(400, "Кошик порожній");
        }

        const [newOrder] = await tx
          .insert(orders)
          .values({
            userId: null, // гість
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

        // Додаємо товари з сесії до orderItems
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
          await tx.insert(orderItems).values({
            orderId,
            articleNumber,
            size,
            quantity,
          });
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
    console.error("Помилка оформлення замовлення:", error);
    next(error);
  }
});

app.post("/orders/guest-checkout", async (req, res) => {
  try {
    const { deliveryAddress, telephone, paymentMethod, cartItems } = req.body;

    // Перевірка обов’язкових полів
    if (!deliveryAddress || !telephone || !paymentMethod || !cartItems) {
      return res.status(400).json({ error: "Всі поля є обов’язковими" });
    }

    // Створюємо нове замовлення для гостя
    const [newOrder] = await db
      .insert(orders)
      .values({
        userId: null, // Гість
        orderStatusId: 2, // "Оформлено"
        deliveryAddress,
        telephone,
        paymentMethod,
        lastUpdated: new Date(),
      })
      .returning({ orderId: orders.orderId });

    const orderId = newOrder.orderId;

    // Додаємо товари з кошика до замовлення
    for (const item of cartItems) {
      const { articleNumber, size, quantity } = item;

      // Перевіряємо наявність товару
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

      if (!productSize.length || productSize[0].stock < quantity) {
        return res.status(400).json({
          error: `Недостатньо товару ${articleNumber} розміру ${size}`,
        });
      }

      // Додаємо товар до замовлення
      await db.insert(orderItems).values({
        orderId,
        articleNumber,
        size,
        quantity,
      });

      // Оновлюємо запаси
      await db
        .update(productSizes)
        .set({ stock: productSize[0].stock - quantity })
        .where(
          and(
            eq(productSizes.articleNumber, articleNumber),
            eq(productSizes.size, size)
          )
        );
    }

    res.status(201).json({ message: "Замовлення оформлено успішно", orderId });
  } catch (error) {
    console.error("Помилка оформлення замовлення:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/orders/history", authenticate, async (req, res, next) => {
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
    console.error("Error fetching order history:", error);
    next(createError(500, "Failed to fetch order history"));
  }
});
//-------------------------------------------------------ORDER-ITEMS----------------------------------------------------------------------
app.get("/order-items/history", authenticate, async (req, res, next) => {
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
    console.error("Помилка отримання позицій історії замовлень:", error);
    next(createError(500, "Не вдалося отримати позиції історії замовлень"));
  }
});

// GET /order-items – отримання позицій замовлення користувача
app.get("/order-items", optionalAuth, async (req, res, next) => {
  try {
    if (req.user) {
      const { userId } = req.user;
      // З'єднуємо orderItems з orders та products, щоб отримати деталі про товари
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
          // Якщо необхідно, можна додати додаткові поля (наприклад, розміри)
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.orderId))
        .leftJoin(
          products,
          eq(orderItems.articleNumber, products.articleNumber)
        )
        .where(
          and(
            eq(orders.userId, userId),
            eq(orders.orderStatusId, 1) // Активний кошик
          )
        );
      return res.json(userOrderItems);
    } else {
      // Для гостей дані беруться із сесії, але ми їх збагачуємо даними з products
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
    console.error("Error fetching order items:", error);
    next(createError(500, "Failed to fetch order items"));
  }
});

// POST /order-items – додавання позиції замовлення
app.post("/order-items", optionalAuth, async (req, res, next) => {
  try {
    const { articleNumber, size, quantity } = req.body;

    if (!articleNumber || !size || quantity === undefined) {
      return next(
        createError(400, "articleNumber, size and quantity are required")
      );
    }

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

    if (!productSize || productSize.length === 0) {
      return next(
        createError(
          404,
          `Розмір ${size} для товару ${articleNumber} не знайдено`
        )
      );
    }

    if (productSize[0].stock < quantity) {
      return next(
        createError(
          400,
          `Недостатньо товару ${articleNumber} розміру ${size} на складі`
        )
      );
    }

    let orderId;

    if (req.user) {
      // Для авторизованих користувачів – обробка кошика в БД
      const userId = req.user.userId;
      let currentOrder = await fetchOne(
        db
          .select({ orderId: orders.orderId })
          .from(orders)
          .where(and(eq(orders.userId, userId), eq(orders.orderStatusId, 1)))
          .limit(1)
      );

      if (!currentOrder) {
        const newOrder = await fetchOne(
          db
            .insert(orders)
            .values({ userId, orderStatusId: 1, lastUpdated: new Date() })
            .returning({ orderId: orders.orderId })
        );
        currentOrder = newOrder;
      } else {
        await db
          .update(orders)
          .set({ lastUpdated: new Date() })
          .where(eq(orders.orderId, currentOrder.orderId));
      }
      orderId = currentOrder.orderId;

      const newOrderItem = await db
        .insert(orderItems)
        .values({
          orderId,
          articleNumber,
          size,
          quantity,
        })
        .returning();

      res.status(201).json(newOrderItem[0]);
    } else {
      // Для гостей – збереження у сесії
      req.session.cart = req.session.cart || [];
      req.session.cart.push({ articleNumber, size, quantity });
      return res.status(201).json({ message: "Товар додано до кошика" });
    }
  } catch (error) {
    console.error("Error adding order item:", error);
    next(createError(500, "Error adding item to cart"));
  }
});

// PUT /order-items/:id – оновлення позиції замовлення
app.put("/order-items/:id", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { size, quantity } = req.body;
    if (!size || !quantity) {
      return next(createError(400, "Поля size та quantity є обов'язковими"));
    }
    const { userId } = req.user;

    const orderItemData = await fetchOne(
      db
        .select()
        .from(orderItems)
        .where(eq(orderItems.productOrderId, Number(id)))
        .limit(1)
    );

    if (!orderItemData) {
      return next(createError(404, "Позицію замовлення не знайдено"));
    }

    const orderData = await fetchOne(
      db.select().from(orders).where(eq(orders.orderId, orderItemData.orderId))
    );

    if (!orderData || orderData.userId !== userId) {
      return next(createError(403, "Неавторизована дія"));
    }

    const updatedOrderItems = await db
      .update(orderItems)
      .set({ size, quantity })
      .where(eq(orderItems.productOrderId, Number(id)))
      .returning();

    res.json(updatedOrderItems[0]);
  } catch (error) {
    console.error("Error updating order item:", error);
    next(createError(500, "Error updating order item"));
  }
});

// DELETE /order-items/:id – видалення позиції замовлення
app.delete("/order-items/:id", authenticate, async (req, res, next) => {
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

    if (!orderItemData) {
      return next(createError(404, "Order item not found"));
    }

    const orderData = await fetchOne(
      db.select().from(orders).where(eq(orders.orderId, orderItemData.orderId))
    );

    if (!orderData || orderData.userId !== userId) {
      return next(createError(403, "Unauthorized action"));
    }

    // Видаляємо orderItem
    await db
      .delete(orderItems)
      .where(eq(orderItems.productOrderId, Number(id)));

    // Перевіряємо, чи залишилися orderItems
    const remainingItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderData.orderId));

    if (remainingItems.length === 0) {
      // Видаляємо ордер, якщо він порожній
      await db.delete(orders).where(eq(orders.orderId, orderData.orderId));
    } else {
      // Оновлюємо lastUpdated, якщо ордер залишився
      await db
        .update(orders)
        .set({ lastUpdated: new Date() })
        .where(eq(orders.orderId, orderData.orderId));
    }

    res.json({ message: "Order item deleted successfully" });
  } catch (error) {
    console.error("Error deleting order item:", error);
    next(createError(500, "Error deleting order item"));
  }
});

app.get("/order-items/count", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.orderId))
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.orderStatusId, 1) // Only items in the cart
        )
      );
    res.json({ count: Number(countResult[0].count) });
  } catch (error) {
    console.error("Error fetching cart item count:", error);
    next(createError(500, "Failed to fetch cart item count"));
  }
});

//-------------------------------------------------------FAVORITES----------------------------------------------------------------------

app.post("/favorites", optionalAuth, async (req, res) => {
  try {
    const { articleNumber } = req.body;

    if (!articleNumber) {
      return res.status(400).json({ error: "articleNumber обов’язковий" });
    }

    if (req.user) {
      // Для авторизованих користувачів – операції з БД
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

      if (existingFavorite.length) {
        return res.status(400).json({ error: "Товар уже в улюблених" });
      }

      const newFavorite = await db
        .insert(favorites)
        .values({ userId, articleNumber })
        .returning();
      return res.status(201).json(newFavorite[0]);
    } else {
      // Для гостей – збереження у сесії
      req.session.favorites = req.session.favorites || [];
      if (req.session.favorites.includes(articleNumber)) {
        return res.status(400).json({ error: "Товар уже в улюблених" });
      }
      req.session.favorites.push(articleNumber);
      return res.status(201).json({ message: "Товар додано до улюблених" });
    }
  } catch (error) {
    console.error("Помилка:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// Використовуємо optionalAuth для підтримки як авторизованих, так і гостей
app.get("/favorites", optionalAuth, async (req, res) => {
  try {
    if (req.user) {
      const { userId } = req.user;
      // Отримуємо базові дані товару із favorites і products
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

      // Для кожного товару отримуємо розміри з productSizes
      const enrichedFavorites = await Promise.all(
        userFavorites.map(async (fav) => {
          const sizes = await db
            .select({
              size: productSizes.size,
              stock: productSizes.stock,
            })
            .from(productSizes)
            .where(eq(productSizes.articleNumber, fav.articleNumber));
          return { ...fav, sizes };
        })
      );
      return res.json(enrichedFavorites);
    } else {
      // Для гостей отримуємо articleNumber з сесії та збагачуємо даними з products
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
          if (product) {
            const sizes = await db
              .select({
                size: productSizes.size,
                stock: productSizes.stock,
              })
              .from(productSizes)
              .where(eq(productSizes.articleNumber, articleNumber));
            return { ...product, sizes };
          }
          return { articleNumber, sizes: [] };
        })
      );
      return res.json(enrichedFavorites);
    }
  } catch (error) {
    console.error("Помилка при отриманні улюблених товарів:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/favorites/:articleNumber", authenticate, async (req, res, next) => {
  try {
    const { articleNumber } = req.params;
    const { userId } = req.user;

    if (!articleNumber) {
      return next(createError(400, "Поле articleNumber є обов'язковим"));
    }

    const existingFavorite = await fetchOne(
      db
        .select()
        .from(favorites)
        .where(eq(favorites.userId, userId))
        .where(eq(favorites.articleNumber, articleNumber))
        .limit(1)
    );

    res.json({ isFavorite: !!existingFavorite });
  } catch (error) {
    console.error("Помилка перевірки улюбленого товару:", error);
    next(
      createError(
        500,
        "Сталася внутрішня помилка сервера при перевірці улюбленого товару"
      )
    );
  }
});

app.delete(
  "/favorites/:articleNumber",
  authenticate,
  async (req, res, next) => {
    try {
      const { articleNumber } = req.params;
      const { userId } = req.user;

      const deletedFavorite = await db
        .delete(favorites)
        .where(eq(favorites.userId, userId))
        .where(eq(favorites.articleNumber, articleNumber))
        .returning();

      if (!deletedFavorite || deletedFavorite.length === 0) {
        return next(createError(404, "Товар не знайдено у ваших улюблених"));
      }

      res.json({ message: "Товар успішно видалено з улюблених" });
    } catch (error) {
      console.error("Помилка видалення товару з улюблених:", error);
      next(
        createError(
          500,
          "Сталася внутрішня помилка сервера при видаленні товару з улюблених"
        )
      );
    }
  }
);

//-------------------------------------------------------REVIEWS----------------------------------------------------------------------

app.post("/reviews", authenticate, async (req, res, next) => {
  try {
    const { articleNumber, rating, comment } = req.body;
    if (!articleNumber || rating === undefined || comment === undefined) {
      return next(
        createError(400, "Обов'язкові поля: articleNumber, rating та comment")
      );
    }

    // Перевірка, чи користувач вже залишив відгук для цього товару
    const existingUserReview = await fetchOne(
      db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.articleNumber, articleNumber),
            eq(reviews.userId, req.user.userId)
          )
        )
        .limit(1)
    );

    if (existingUserReview) {
      return next(createError(400, "Ви вже залишили відгук для цього товару"));
    }

    const reviewDate = new Date().toISOString();

    const [newReview] = await db
      .insert(reviews)
      .values({
        userId: req.user.userId,
        articleNumber,
        rating,
        comment,
        reviewDate,
      })
      .returning();

    res.status(201).json(newReview);
  } catch (error) {
    console.error("Помилка створення відгуку:", error);
    next(error);
  }
});

app.get("/reviews/:articleNumber", async (req, res, next) => {
  try {
    const { articleNumber } = req.params;
    if (!articleNumber) {
      return next(
        createError(
          400,
          "Необхідно вказати articleNumber для отримання відгуків"
        )
      );
    }

    const productReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.articleNumber, articleNumber))
      .orderBy(reviews.reviewDate, "desc");

    res.json(productReviews);
  } catch (error) {
    console.error("Помилка отримання відгуків:", error);
    next(error);
  }
});

app.put("/reviews/:reviewId", authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    if (rating === undefined || comment === undefined) {
      return next(
        createError(400, "Обов'язкові поля для редагування: rating та comment")
      );
    }

    const existingReview = await fetchOne(
      db
        .select()
        .from(reviews)
        .where(eq(reviews.reviewId, Number(reviewId)))
        .limit(1)
    );

    if (!existingReview) {
      return next(createError(404, "Відгук не знайдено"));
    }

    if (existingReview.userId !== req.user.userId) {
      return next(createError(403, "Ви не маєте прав редагувати цей відгук"));
    }

    const reviewTimestamp = new Date(existingReview.reviewDate).getTime();
    const nowTimestamp = Date.now();
    if (nowTimestamp - reviewTimestamp > 10 * 60 * 1000) {
      return next(createError(403, "Час для редагування відгуку вичерпано"));
    }

    const [updatedReview] = await db
      .update(reviews)
      .set({ rating, comment })
      .where(eq(reviews.reviewId, Number(reviewId)))
      .returning();

    res.json(updatedReview);
  } catch (error) {
    console.error("Помилка оновлення відгуку:", error);
    next(error);
  }
});

app.delete("/reviews/:reviewId", authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;

    const existingReview = await fetchOne(
      db
        .select()
        .from(reviews)
        .where(eq(reviews.reviewId, Number(reviewId)))
        .limit(1)
    );

    if (!existingReview) {
      return next(createError(404, "Відгук не знайдено"));
    }

    if (existingReview.userId !== req.user.userId) {
      return next(createError(403, "Ви не маєте прав видаляти цей відгук"));
    }

    await db
      .delete(reviews)
      .where(eq(reviews.reviewId, Number(reviewId)))
      .returning();

    res.json({ message: "Відгук успішно видалено" });
  } catch (error) {
    console.error("Помилка видалення відгуку:", error);
    next(error);
  }
});

//-------------------------------------------------------SIZES----------------------------------------------------------------------
app.get("/sizes", async (req, res, next) => {
  try {
    const sizes = await db
      .select({ size: productSizes.size })
      .from(productSizes)
      .groupBy(productSizes.size);
    res.json(sizes);
  } catch (error) {
    console.error("Error fetching sizes:", error);
    next(createError(500, "Не вдалося отримати розміри"));
  }
});

//---------------------------------------------------------------------------------------------------------------------------------------

// Налаштування multer для завантаження файлів у папку "uploads"
const uploadExcel = multer({ dest: "uploads/" });

// Ендпоінт для імпорту даних з Excel
app.post("/upload-excel", uploadExcel.single("file"), async (req, res) => {
  try {
    // Перевірка, чи файл завантажено
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Файл не завантажено" });
    }

    // Зчитування Excel-файлу
    const workbook = xlsx.readFile(file.path, { cellDates: true });
    const brandsSheet = workbook.Sheets["Brands"];
    const categoriesSheet = workbook.Sheets["Categories"];
    const productsSheet = workbook.Sheets["Products"];

    // Перевірка наявності необхідних аркушів
    if (!brandsSheet || !categoriesSheet || !productsSheet) {
      return res.status(400).json({
        error:
          'Файл повинен містити аркуші "Brands", "Categories" і "Products"',
      });
    }

    // Перетворення аркушів у JSON
    const brandsData = xlsx.utils.sheet_to_json(brandsSheet);
    const categoriesData = xlsx.utils.sheet_to_json(categoriesSheet);
    const productsData = xlsx.utils.sheet_to_json(productsSheet);

    // Ініціалізація логування
    const log = { added: 0, updated: 0, skipped: 0, errors: [] };

    // Виконання імпорту в транзакції
    await db.transaction(async (tx) => {
      // **Імпорт брендів**
      for (const brand of brandsData) {
        if (!brand.name || typeof brand.name !== "string") {
          log.errors.push(
            `Пропущено бренд: name є обов'язковим і має бути рядком`
          );
          continue;
        }

        const existingBrand = await tx
          .select()
          .from(brands)
          .where(eq(brands.name, brand.name))
          .limit(1);

        if (existingBrand.length > 0) {
          log.skipped++;
        } else {
          await tx.insert(brands).values({ name: brand.name });
          log.added++;
        }
      }

      // **Імпорт категорій**
      for (const category of categoriesData) {
        if (!category.name || typeof category.name !== "string") {
          log.errors.push(
            `Пропущено категорію: name є обов'язковим і має бути рядком`
          );
          continue;
        }

        const existingCategory = await tx
          .select()
          .from(categories)
          .where(eq(categories.name, category.name))
          .limit(1);

        if (existingCategory.length > 0) {
          if (
            category.imageUrl &&
            category.imageUrl !== existingCategory[0].imageUrl
          ) {
            await tx
              .update(categories)
              .set({ imageUrl: category.imageUrl })
              .where(eq(categories.categoryId, existingCategory[0].categoryId));
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

      // **Імпорт продуктів**
      for (const product of productsData) {
        // Валідація обов'язкових полів
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

        // Перевірка бренду
        const brand = await tx
          .select()
          .from(brands)
          .where(eq(brands.name, product.brand))
          .limit(1);
        if (brand.length === 0) {
          log.errors.push(
            `Пропущено продукт ${product.articleNumber}: бренд "${product.brand}" не знайдено`
          );
          continue;
        }

        // Перевірка категорії
        const category = await tx
          .select()
          .from(categories)
          .where(eq(categories.name, product.category))
          .limit(1);
        if (category.length === 0) {
          log.errors.push(
            `Пропущено продукт ${product.articleNumber}: категорію "${product.category}" не знайдено`
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

        if (existingProduct.length > 0) {
          // Перевірка на дублікат
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

          // Оновлення продукту
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
                imageUrls.length > 0 ? imageUrls : existingProduct[0].imageUrls,
              isActive: true,
            })
            .where(eq(products.articleNumber, product.articleNumber));

          await tx
            .update(productCategories)
            .set({
              categoryId: category[0].categoryId,
              imageUrl: imageUrls[0] || null,
            })
            .where(eq(productCategories.articleNumber, product.articleNumber));

          // Обробка розмірів
          if (product.sizes) {
            try {
              const sizes = JSON.parse(product.sizes);
              if (Array.isArray(sizes)) {
                await tx
                  .delete(productSizes)
                  .where(eq(productSizes.articleNumber, product.articleNumber));
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
          // Додавання нового продукту
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

          // Обробка розмірів
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

    // Видалення тимчасового файлу
    await fs.unlink(file.path);

    // Відповідь із результатами імпорту
    res.json({ message: "Дані успішно імпортовано", log });
  } catch (error) {
    console.error("Помилка імпорту:", error);
    res.status(500).json({ error: "Помилка імпорту даних" });
  }
});

//---------------------------------------------------------------------------------------------------------------------------------------

app.get("/favorites/count", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const countResult = await db
      .select({ count: db.fn.count(favorites.favoriteId) })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    const count = countResult[0].count || 0;
    res.json({ count });
  } catch (error) {
    console.error("Помилка підрахунку улюблених товарів:", error);
    next(createError(500, "Не вдалося отримати кількість улюблених товарів"));
  }
});
app.get("/order-items/count", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const currentOrder = await fetchOne(
      db
        .select({ orderId: orders.orderId })
        .from(orders)
        .where(
          and(eq(orders.userId, userId), eq(orders.orderStatusId, 1)) // 1 = активний кошик
        )
        .limit(1)
    );

    if (!currentOrder) {
      return res.json({ count: 0 });
    }

    const countResult = await db
      .select({ count: db.fn.count(orderItems.productOrderId) })
      .from(orderItems)
      .where(eq(orderItems.orderId, currentOrder.orderId));
    const count = countResult[0].count || 0;
    res.json({ count });
  } catch (error) {
    console.error("Помилка підрахунку товарів у кошику:", error);
    next(createError(500, "Не вдалося отримати кількість товарів у кошику"));
  }
});

// Ендпоінт для генерації звіту з замовлень
app.get("/generate-report", authenticate, async (req, res, next) => {
  try {
    // Отримуємо всі замовлення з інформацією про користувача та статус
    const allOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        orderDate: orders.orderDate,
        deliveryAddress: orders.deliveryAddress,
        telephone: orders.telephone,
        paymentMethod: orders.paymentMethod,
        userEmail: users.email, // Додаємо email користувача
        userName: users.name, // Додаємо ім'я користувача
        statusName: orderStatus.name, // Додаємо текстовий статус
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.userId)) // Приєднуємо таблицю users
      .leftJoin(
        orderStatus,
        eq(orders.orderStatusId, orderStatus.orderStatusId)
      ); // Приєднуємо таблицю orderStatus

    // Формуємо дані для Excel
    const worksheetData = allOrders.map((order) => ({
      "ID замовлення": order.orderId,
      "Ім'я користувача": order.userName || "Не вказано",
      "Пошта користувача": order.userEmail || "Не вказано",
      Статус: order.statusName || "Не визначено", // Текстовий статус
      "Дата замовлення": order.orderDate.toISOString(),
      "Адреса доставки": order.deliveryAddress || "Не вказано",
      Телефон: order.telephone || "Не вказано",
      "Метод оплати": order.paymentMethod || "Не вказано",
    }));

    // Створюємо новий workbook та worksheet
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(worksheetData);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Замовлення");

    // Зберігаємо файл тимчасово
    const filePath = path.join(__dirname, "report.xlsx");
    xlsx.writeFile(workbook, filePath);

    // Відправляємо файл клієнту
    res.download(filePath, "orders_report.xlsx", async (err) => {
      if (err) {
        console.error("Помилка відправки файлу:", err);
        return next(err);
      }
      // Видаляємо тимчасовий файл після відправки
      await fs.unlink(filePath);
    });
  } catch (error) {
    console.error("Помилка формування звіту:", error);
    next(createError(500, "Помилка формування звіту"));
  }
});

app.get("/admin/orders", authenticate, async (req, res, next) => {
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

app.get("/admin/orders/:orderId", authenticate, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    // Завантаження загальних даних замовлення
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

    // Отримання деталей замовлення з JOIN до products для отримання ціни
    const items = await db
      .select({
        orderItemId: orderItems.productOrderId,
        orderId: orderItems.orderId,
        articleNumber: orderItems.articleNumber,
        size: orderItems.size,
        quantity: orderItems.quantity,
        price: products.price, // беремо ціну з таблиці products
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.articleNumber, products.articleNumber))
      .where(eq(orderItems.orderId, Number(orderId)));
    res.json({ ...order, items });
  } catch (error) {
    console.error("Error fetching order details:", error);
    next(createError(500, "Не вдалося отримати деталі замовлення"));
  }
});

app.put(
  "/admin/orders/:orderId",
  authenticate,

  async (req, res, next) => {
    try {
      const { orderId } = req.params;
      const { orderStatusId, deliveryAddress, telephone, paymentMethod } =
        req.body;
      const [updatedOrder] = await db
        .update(orders)
        .set({ orderStatusId, deliveryAddress, telephone, paymentMethod })
        .where(eq(orders.orderId, Number(orderId)))
        .returning();
      if (!updatedOrder)
        return next(createError(404, "Замовлення не знайдено"));
      res.json(updatedOrder);
    } catch (error) {
      next(createError(500, "Не вдалося оновити замовлення"));
    }
  }
);

app.delete(
  "/admin/orders/:orderId",
  authenticate,

  async (req, res, next) => {
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
  }
);

// --- Управління коментарями ---

app.get("/admin/reviews", authenticate, async (req, res, next) => {
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

app.put(
  "/admin/reviews/:reviewId",
  authenticate,

  async (req, res, next) => {
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
  }
);

app.delete(
  "/admin/reviews/:reviewId",
  authenticate,

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

// --- Управління користувачами ---

app.get("/admin/users", authenticate, async (req, res, next) => {
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

app.put(
  "/admin/users/:userId",
  authenticate,

  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { name, email, roleId, telephone, deliveryAddress } = req.body;
      const [updatedUser] = await db
        .update(users)
        .set({ name, email, roleId, telephone, deliveryAddress })
        .where(eq(users.userId, Number(userId)))
        .returning();
      if (!updatedUser)
        return next(createError(404, "Користувача не знайдено"));
      res.json(updatedUser);
    } catch (error) {
      next(createError(500, "Не вдалося оновити користувача"));
    }
  }
);

app.delete(
  "/admin/users/:userId",
  authenticate,

  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const deleted = await db
        .delete(users)
        .where(eq(users.userId, Number(userId)))
        .returning();
      if (!deleted.length)
        return next(createError(404, "Користувача не знайдено"));
      res.json({ message: "Користувача успішно видалено" });
    } catch (error) {
      next(createError(500, "Не вдалося видалити користувача"));
    }
  }
);
//---------------------------------------------------------------------------------------------------------------------------------------

cron.schedule("0 * * * *", async () => {
  // Щогодини
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.delete(orders).where(
      and(
        eq(orders.orderStatusId, 1), // Тільки кошики
        lt(orders.lastUpdated, twentyFourHoursAgo)
      )
    );
    console.log("Old orders cleaned up");
  } catch (error) {
    console.error("Error deleting old orders:", error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Сталася внутрішня помилка сервера",
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
