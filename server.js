import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./db/index.js";
import {
  products,
  users,
  brands,
  categories,
  orders,
  orderItems,
  productSizes,
  favorites,
} from "./db/schema.js";

import { eq, ilike } from "drizzle-orm";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticate } from "./middleware/auth.js";
import createError from "http-errors";

dotenv.config();
const app = express();

app.use(
  cors({
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

//-------------------------------------------------------USERS----------------------------------------------------------------------

app.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      // 400 – помилка клієнта
      return next(createError(400, "Усі поля обов'язкові!"));
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const name = sanitizedEmail.split("@")[0];

    // Перевірка чи користувач з таким email вже існує
    const existingUser = await db
      .select({ email: users.email, userId: users.userId })
      .from(users)
      .where(eq(users.email, sanitizedEmail))
      .limit(1)
      .then((results) => results[0]);

    if (existingUser) {
      // 409 – конфлікт (користувач вже існує)
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
      return next(createError(500, "Не вдалося створити користувача"));
    }

    const newUser = insertedUsers[0];
    const token = jwt.sign({ userId: newUser.userId }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

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
});

// Роут входу користувача
app.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(createError(400, "Усі поля обов'язкові!"));
    }

    const sanitizedEmail = email.trim().toLowerCase();

    const user = await db
      .select({
        userId: users.userId,
        email: users.email,
        password: users.password,
      })
      .from(users)
      .where(eq(users.email, sanitizedEmail))
      .limit(1)
      .then((results) => results[0]);

    if (!user) {
      return next(createError(404, "Користувача не знайдено!"));
    }

    if (!user.password) {
      return next(
        createError(
          400,
          "Ви зареєстровані через Google. Використовуйте Google для входу."
        )
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return next(createError(401, "Невірний пароль!"));
    }

    const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (error) {
    console.error("Помилка входу:", error);
    next(error);
  }
});

// Захищений роут для отримання даних користувача
app.get("/protected", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const user = await db
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
      .then((results) => results[0]);

    if (!user) {
      return next(createError(404, "Користувач не знайдений"));
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Помилка отримання даних користувача:", error);
    next(error);
  }
});

// Роут для оновлення даних користувача
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

// Роут для видалення користувача
app.delete("/user", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const deletedUser = await db
      .delete()
      .from(users)
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

// Роут для отримання ролі користувача
app.get("/getUserRole", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const user = await db
      .select({ roleId: users.roleId })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1)
      .then((results) => results[0]);

    if (!user) {
      return next(createError(404, "Користувач не знайдений"));
    }

    res.json({ roleId: user.roleId });
  } catch (error) {
    console.error("Помилка отримання ролі користувача:", error);
    next(error);
  }
});
//-------------------------------------------------------PRODUCTS----------------------------------------------------------------------

app.get("/products", async (req, res) => {
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
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId));

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
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/products", async (req, res) => {
  try {
    const {
      articleNumber,
      brandId,
      price,
      discount,
      name,
      description,
      imageUrls,
      sizes,
    } = req.body;

    if (
      !articleNumber ||
      !brandId ||
      !price ||
      !name ||
      !description ||
      !imageUrls
    ) {
      return res.status(400).json({
        error:
          "Поля articleNumber, brandId, price, name, description та imageUrls є обов'язковими",
      });
    }

    const [newProduct] = await db
      .insert(products)
      .values({
        articleNumber,
        brandId,
        price,
        discount: discount || 0,
        name,
        description,
        imageUrls,
      })
      .returning();

    if (sizes && Array.isArray(sizes)) {
      for (const sizeObj of sizes) {
        const { size, stock } = sizeObj;
        if (!size || stock == null) continue;
        await db.insert(productSizes).values({
          articleNumber,
          size,
          stock,
        });
      }
    }

    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ error: "Error adding product" });
  }
});

app.get("/product/:articleNumber", async (req, res) => {
  try {
    const { articleNumber } = req.params;
    const product = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .where(eq(products.articleNumber, articleNumber))
      .limit(1)
      .then((result) => result[0]);

    if (!product) {
      return res.status(404).json({ error: "Продукт не знайдено" });
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
    res.status(500).json({ error: "Не вдалося отримати дані продукту" });
  }
});

// Endpoint для пошуку товарів за назвою
app.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res
        .status(400)
        .json({ error: "Будь ласка, вкажіть параметр пошуку (q)" });
    }

    // Використовуємо ilike для нечутливого до регістру пошуку
    const productsList = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrls: products.imageUrls,
        brand: brands.name,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .where(ilike(products.name, `%${q}%`));

    // Отримуємо розміри для кожного товару
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
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

//-------------------------------------------------------CATEGORIES----------------------------------------------------------------------

app.get("/categories", async (req, res) => {
  try {
    const allCategories = await db
      .select({
        categoryId: categories.categoryId,
        name: categories.name,
        imageUrl: categories.imageUrl,
      })
      .from(categories);

    res.json(allCategories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

app.post("/categories", async (req, res) => {
  try {
    const { name, imageUrl } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Поле назви є обов'язкове" });
    }

    const [newCategory] = await db
      .insert(categories)
      .values({
        name,
        imageUrl,
      })
      .returning();

    res.status(201).json(newCategory);
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ error: "Error adding category" });
  }
});
//-------------------------------------------------------BRANDS--------------------------------------------------------------------------

app.get("/brands", async (req, res) => {
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
    res.status(500).json({ error: "Failed to fetch brands" });
  }
});

app.post("/brands", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Поле назви є обов'язкове" });
    }

    const [newBrand] = await db
      .insert(brands)
      .values({
        name,
      })
      .returning();

    res.status(201).json(newBrand);
  } catch (error) {
    console.error("Error adding brand:", error);
    res.status(500).json({ error: "Error adding brand" });
  }
});

app.get("/brand/:brandId", async (req, res) => {
  try {
    const { brandId } = req.params;

    const brand = await db
      .select({
        name: brands.name,
      })
      .from(brands)
      .where(eq(brands.brandId, Number(brandId)))
      .limit(1)
      .then((result) => result[0]);

    if (!brand) {
      return res.status(404).json({ error: "Бренд не знайдено" });
    }

    res.json({ brand });
  } catch (error) {
    console.error("Помилка отримання бренду за brandId:", error);
    res.status(500).json({ error: "Не вдалося отримати дані бренду" });
  }
});

//-------------------------------------------------------ORDERS--------------------------------------------------------------------------
app.get("/orders", async (req, res) => {
  try {
    const allOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        cartData: orders.cartData,
      })
      .from(orders);

    res.json(allOrders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.post("/orders", async (req, res) => {
  try {
    const { userId, orderStatusId, cartData } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Поле userId є обов'язкове" });
    }

    const [newOrder] = await db
      .insert(orders)
      .values({
        userId,
        orderStatusId,
        cartData,
      })
      .returning();

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error adding order:", error);
    res.status(500).json({ error: "Error adding order" });
  }
});

//---------------------------------------------------ORDER-ITEMS-------------------------------------------------------------------------
app.get("/order-items", async (req, res) => {
  try {
    const allOrderItems = await db
      .select({
        productOrderId: orderItems.productOrderId,
        orderId: orderItems.orderId,
        articleNumber: orderItems.articleNumber,
        size: orderItems.size,
        quantity: orderItems.quantity,
      })
      .from(orderItems);

    res.json(allOrderItems);
  } catch (error) {
    console.error("Error fetching order items:", error);
    res.status(500).json({ error: "Failed to fetch order items" });
  }
});

app.post("/order-items", async (req, res) => {
  try {
    const { articleNumber, size, quantity } = req.body;
    const { userId } = req.user;

    if (!articleNumber || !size || quantity === undefined) {
      return res.status(400).json({
        error: "articleNumber, size and quantity are required",
      });
    }

    // Find the current active order for the user
    let currentOrder = await db
      .select("orderId")
      .from(orders)
      .where(eq(orders.userId, userId))
      .where(eq(orders.orderStatusId, 1)) // Assuming 1 is the status for active orders
      .limit(1)
      .then((res) => res[0]);

    if (!currentOrder) {
      // If no active order, create a new one
      const newOrder = await db
        .insert(orders)
        .values({
          userId,
          orderStatusId: 1, // Active order status
          cartData: [],
        })
        .returning("orderId")
        .then((res) => res[0]);

      currentOrder = newOrder;
    }

    // Add the item to the order-items table
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
  } catch (error) {
    console.error("Error adding order item:", error);
    res.status(500).json({ error: "Error adding item to cart" });
  }
});

app.put("/order-items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { size, quantity } = req.body;
    if (!size || !quantity) {
      return res
        .status(400)
        .json({ error: "Поля size та quantity є обов'язковими" });
    }
    const updatedOrderItems = await db
      .update(orderItems)
      .set({ size, quantity })
      .where(eq(orderItems.productOrderId, Number(id)))
      .returning();
    if (updatedOrderItems.length === 0) {
      return res.status(404).json({ error: "Позицію замовлення не знайдено" });
    }
    res.json(updatedOrderItems[0]);
  } catch (error) {
    console.error("Error updating order item:", error);
    res.status(500).json({ error: "Error updating order item" });
  }
});

app.delete("/order-items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedItems = await db
      .delete(orderItems)
      .where(eq(orderItems.productOrderId, Number(id)))
      .returning();
    if (deletedItems.length === 0) {
      return res.status(404).json({ error: "Позицію замовлення не знайдено" });
    }
    res.json(deletedItems[0]);
  } catch (error) {
    console.error("Помилка видалення позиції замовлення:", error);
    res.status(500).json({ error: "Не вдалося видалити позицію замовлення" });
  }
});
//-------------------------------------------------------FAVORITES-----------------------------------------------------------------------
// Додавання товару в улюблені
app.post("/favorites", authenticate, async (req, res) => {
  try {
    const { articleNumber } = req.body;
    const { userId } = req.user;

    if (!articleNumber) {
      return res
        .status(400)
        .json({ error: "Поле articleNumber є обов'язковим" });
    }

    const existingFavorite = await db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .where(eq(favorites.articleNumber, articleNumber))
      .limit(1)
      .then((res) => res[0]);

    if (existingFavorite) {
      return res.status(400).json({ error: "Цей товар вже в улюблених" });
    }

    const newFavorite = await db
      .insert(favorites)
      .values({
        userId,
        articleNumber,
        createdAt: new Date().toISOString(),
      })
      .returning();

    res.status(201).json(newFavorite[0]);
  } catch (error) {
    console.error("Помилка додавання в улюблені:", error);
    res.status(500).json({ error: "Сталася внутрішня помилка сервера" });
  }
});

// Отримання улюблених товарів користувача
app.get("/favorites", authenticate, async (req, res) => {
  try {
    const { userId } = req.user;

    const userFavorites = await db
      .select({
        articleNumber: favorites.articleNumber,
        createdAt: favorites.createdAt,
      })
      .from(favorites)
      .where(eq(favorites.userId, userId));

    if (userFavorites.length === 0) {
      return res.status(404).json({ error: "У вас немає улюблених товарів" });
    }

    // Отримання даних про кожен товар
    const favoriteProducts = await Promise.all(
      userFavorites.map(async (favorite) => {
        const product = await db
          .select({
            articleNumber: products.articleNumber,
            name: products.name,
            price: products.price,
            discount: products.discount,
            imageUrls: products.imageUrls,
          })
          .from(products)
          .where(eq(products.articleNumber, favorite.articleNumber))
          .limit(1)
          .then((res) => res[0]);

        return product ? { ...product, createdAt: favorite.createdAt } : null;
      })
    );

    res.json(favoriteProducts.filter(Boolean));
  } catch (error) {
    console.error("Помилка отримання улюблених товарів:", error);
    res.status(500).json({ error: "Не вдалося отримати улюблені товари" });
  }
});

// Перевірка, чи товар є в улюблених
app.get("/favorites/:articleNumber", authenticate, async (req, res) => {
  try {
    const { articleNumber } = req.params;
    const { userId } = req.user;

    if (!articleNumber) {
      return res
        .status(400)
        .json({ error: "Поле articleNumber є обов'язковим" });
    }

    const existingFavorite = await db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .where(eq(favorites.articleNumber, articleNumber))
      .limit(1)
      .then((result) => result[0]);

    res.json({ isFavorite: !!existingFavorite });
  } catch (error) {
    console.error("Помилка перевірки улюбленого товару:", error);
    res.status(500).json({
      error:
        "Сталася внутрішня помилка сервера при перевірці улюбленого товару",
    });
  }
});

// Видалення товару з улюблених
app.delete("/favorites/:articleNumber", authenticate, async (req, res) => {
  try {
    const { articleNumber } = req.params;
    const { userId } = req.user;

    const deletedFavorite = await db
      .delete(favorites)
      .where(eq(favorites.userId, userId))
      .where(eq(favorites.articleNumber, articleNumber))
      .returning();

    if (!deletedFavorite || deletedFavorite.length === 0) {
      return res
        .status(404)
        .json({ error: "Товар не знайдено у ваших улюблених" });
    }

    res.json({ message: "Товар успішно видалено з улюблених" });
  } catch (error) {
    console.error("Помилка видалення товару з улюблених:", error);
    res.status(500).json({
      error:
        "Сталася внутрішня помилка сервера при видаленні товару з улюблених",
    });
  }
});

//---------------------------------------------------REVIEWS------------------------------------------------------------------------------
// app.get("/reviews/:articleNumber", async (req, res) => {
//   try {
//     const { articleNumber } = req.params;

//     if (!articleNumber) {
//       return res.status(400).json({ message: "articleNumber is required" });
//     }

//     // Отримання всіх відгуків для товару
//     const reviews = await db
//       .select()
//       .from(reviews)
//       .where(eq(reviews.articleNumber, Number(articleNumber)));

//     if (reviews.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "No reviews found for this product" });
//     }

//     res.status(200).json(reviews);
//   } catch (error) {
//     console.error("Error fetching reviews:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// app.post("/reviews", authenticate, async (req, res) => {
//   try {
//     const { userId, articleNumber, rating, comment } = req.body;

//     // Перевірка обов'язкових полів
//     if (!userId || !articleNumber || !rating || !comment) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // Перевірка на правильність articleNumber
//     const parsedArticleNumber = Number(articleNumber);
//     if (isNaN(parsedArticleNumber)) {
//       return res.status(400).json({ message: "Invalid articleNumber" });
//     }

//     // Додавання нового відгуку
//     const [newReview] = await db
//       .insert(reviews)
//       .values({
//         userId,
//         articleNumber: parsedArticleNumber,
//         rating,
//         comment,
//         reviewDate: new Date().toISOString(),
//       })
//       .returning();

//     res.status(201).json(newReview);
//   } catch (error) {
//     console.error("Error adding review:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

//---------------------------------------------------------------------------------------------------------------------------------------

app.use((err, req, res, next) => {
  // Лог помилки можна доповнити записом в систему моніторингу
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Сталася внутрішня помилка сервера",
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
