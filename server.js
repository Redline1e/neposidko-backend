import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import createError from "http-errors";
import { db } from "./db/index.js";
import { eq, ilike, and } from "drizzle-orm";
import { authenticate } from "./middleware/auth.js";
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
} from "./db/schema.js";

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

// Допоміжна функція для отримання першого результату запиту
const fetchOne = async (query) => {
  const results = await query;
  return results[0];
};

//-------------------------------------------------------USERS----------------------------------------------------------------------

app.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
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

app.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(createError(400, "Усі поля обов'язкові!"));
    }

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
        category: categories.name, // Назва категорії
        categoryId: categories.categoryId, // Ідентифікатор категорії
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

app.post("/products", async (req, res, next) => {
  try {
    const {
      articleNumber,
      brandId,
      categoryId, // отримуємо categoryId з тіла запиту
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
      !categoryId || // перевірка наявності categoryId
      !price ||
      !name ||
      !description ||
      !imageUrls
    ) {
      return next(
        createError(
          400,
          "Поля articleNumber, brandId, categoryId, price, name, description та imageUrls є обов'язковими"
        )
      );
    }

    // Вставка товару в таблицю products
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

    // Вставка запису в productCategories для прив'язки категорії
    await db.insert(productCategories).values({
      articleNumber,
      categoryId, // використовуємо categoryId, отриманий з тіла запиту
      imageUrl: imageUrls[0], // або інше значення, яке ви хочете зберегти
    });

    // Вставка розмірів
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
    next(createError(500, "Error adding product"));
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
        })
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.brandId))
        .where(eq(products.articleNumber, articleNumber))
        .limit(1)
    );

    if (!product) {
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
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .where(ilike(products.name, `%${q}%`));

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

    res.json(allCategories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    next(createError(500, "Failed to fetch categories"));
  }
});

app.post("/categories", async (req, res, next) => {
  try {
    const { name, imageUrl } = req.body;

    if (!name) {
      return next(createError(400, "Поле назви є обов'язкове"));
    }

    const [newCategory] = await db
      .insert(categories)
      .values({ name, imageUrl })
      .returning();

    res.status(201).json(newCategory);
  } catch (error) {
    console.error("Error adding category:", error);
    next(createError(500, "Error adding category"));
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

//-------------------------------------------------------ORDERS----------------------------------------------------------------------

app.get("/orders", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const userOrders = await db
      .select({
        orderId: orders.orderId,
        userId: orders.userId,
        orderStatusId: orders.orderStatusId,
        cartData: orders.cartData,
      })
      .from(orders)
      .where(eq(orders.userId, userId));

    res.json(userOrders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    next(createError(500, "Failed to fetch orders"));
  }
});

app.post("/orders", authenticate, async (req, res, next) => {
  try {
    const { orderStatusId, cartData } = req.body;
    const { userId } = req.user;

    const [newOrder] = await db
      .insert(orders)
      .values({ userId, orderStatusId, cartData })
      .returning();

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error adding order:", error);
    next(createError(500, "Error adding order"));
  }
});

//-------------------------------------------------------ORDER-ITEMS----------------------------------------------------------------------

app.get("/order-items", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const userOrderItems = await db
      .select({
        productOrderId: orderItems.productOrderId,
        orderId: orderItems.orderId,
        articleNumber: orderItems.articleNumber,
        size: orderItems.size,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.orderId))
      .where(eq(orders.userId, userId));

    res.json(userOrderItems);
  } catch (error) {
    console.error("Error fetching order items:", error);
    next(createError(500, "Failed to fetch order items"));
  }
});

app.post("/order-items", authenticate, async (req, res, next) => {
  try {
    const { articleNumber, size, quantity } = req.body;
    const { userId } = req.user;

    if (!articleNumber || !size || quantity === undefined) {
      return next(
        createError(400, "articleNumber, size and quantity are required")
      );
    }

    // Знаходимо активне замовлення для користувача
    let currentOrder = await fetchOne(
      db
        .select("orderId")
        .from(orders)
        .where(eq(orders.userId, userId))
        .where(eq(orders.orderStatusId, 1))
        .limit(1)
    );

    if (!currentOrder) {
      const newOrder = await fetchOne(
        db
          .insert(orders)
          .values({
            userId,
            orderStatusId: 1,
            cartData: [],
          })
          .returning("orderId")
      );
      currentOrder = newOrder;
    }

    // Додаємо позицію до таблиці orderItems
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
    next(createError(500, "Error adding item to cart"));
  }
});

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
      return next(createError(404, "Позицію замовлення не знайдено"));
    }

    const orderData = await fetchOne(
      db.select().from(orders).where(eq(orders.orderId, orderItemData.orderId))
    );

    if (!orderData || orderData.userId !== userId) {
      return next(createError(403, "Неавторизована дія"));
    }

    const deletedItems = await db
      .delete(orderItems)
      .where(eq(orderItems.productOrderId, Number(id)))
      .returning();

    res.json(deletedItems[0]);
  } catch (error) {
    console.error("Помилка видалення позиції замовлення:", error);
    next(createError(500, "Не вдалося видалити позицію замовлення"));
  }
});

//-------------------------------------------------------FAVORITES----------------------------------------------------------------------

app.post("/favorites", authenticate, async (req, res, next) => {
  try {
    const { articleNumber } = req.body;
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

    if (existingFavorite) {
      return next(createError(400, "Цей товар вже в улюблених"));
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
    next(createError(500, "Сталася внутрішня помилка сервера"));
  }
});

app.get("/favorites", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const userFavorites = await db
      .select({
        articleNumber: favorites.articleNumber,
        createdAt: favorites.createdAt,
      })
      .from(favorites)
      .where(eq(favorites.userId, userId));

    // Отримання даних про кожен товар
    const favoriteProducts = await Promise.all(
      userFavorites.map(async (favorite) => {
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
            .where(eq(products.articleNumber, favorite.articleNumber))
            .limit(1)
        );
        return product ? { ...product, createdAt: favorite.createdAt } : null;
      })
    );

    res.json(favoriteProducts.filter(Boolean));
  } catch (error) {
    console.error("Помилка отримання улюблених товарів:", error);
    next(createError(500, "Не вдалося отримати улюблені товари"));
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

//---------------------------------------------------------------------------------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Сталася внутрішня помилка сервера",
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
