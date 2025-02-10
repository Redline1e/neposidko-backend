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
} from "./db/schema.js";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import session from "express-session";
import { authenticate } from "./middleware/auth.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
// app.use(
//   session({
//     secret: process.env.AUTH_SECRET,
//     resave: false,
//     saveUninitialized: false,
//   })
// );
// app.use(passport.initialize());
// app.use(passport.session());

//-------------------------------------------------------USERS----------------------------------------------------------------------

app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Усі поля обов'язкові!" });
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const name = sanitizedEmail.split("@")[0];

    const existingUser = await db
      .select({
        email: users.email,
        userId: users.userId,
      })
      .from(users)
      .where(eq(users.email, sanitizedEmail))
      .limit(1)
      .then((res) => res[0]);

    if (existingUser) {
      return res.status(400).json({ error: "Користувач вже існує!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertedUsers = await db
      .insert(users)
      .values({
        name,
        email: sanitizedEmail,
        password: hashedPassword,
        roleId: 2,
      })
      .returning({
        userId: users.userId,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
      });

    if (insertedUsers.length === 0) {
      return res.status(500).json({ error: "Не вдалося створити користувача" });
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
    res.status(500).json({ error: "Сталася внутрішня помилка сервера" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Усі поля обов'язкові!" });
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
      .then((res) => res[0]);

    if (!user) {
      return res.status(400).json({ error: "Користувача не знайдено!" });
    }

    if (!user.password) {
      return res.status(400).json({
        error:
          "Ви зареєстровані через Google. Використовуйте Google для входу.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ error: "Невірний пароль!" });
    }

    const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (error) {
    console.error("Помилка входу:", error);
    res.status(500).json({ error: "Сталася внутрішня помилка сервера" });
  }
});

app.get("/protected", authenticate, async (req, res) => {
  try {
    const { userId, name, email } = req.user;

    res.status(200).json({ userId, name, email });
  } catch (error) {
    console.error("Помилка отримання даних користувача:", error);
    res.status(500).json({ error: "Виникла помилка на сервері" });
  }
});

app.get("/getUserRole", authenticate, async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await db
      .select({ roleId: users.roleId })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1)
      .then((res) => res[0]);

    if (!user) {
      return res.status(404).json({ error: "Користувач не знайдений" });
    }

    res.json({ roleId: user.roleId });
  } catch (error) {
    console.error("Помилка отримання ролі користувача:", error);
    res.status(500).json({ error: "Виникла помилка на сервері" });
  }
});

//-------------------------------------------------------PRODUCTS----------------------------------------------------------------------

// GET /products
app.get("/products", async (req, res) => {
  try {
    // Отримуємо основні дані продукту (articleNumber, name, price, discount, description, imageUrl, бренд)
    const allProducts = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name, // нове поле
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrl: products.imageUrl,
        brand: brands.name,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId));

    // Для кожного продукту отримуємо доступні розміри з таблиці productSizes
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

// POST /products
app.post("/products", async (req, res) => {
  try {
    const {
      articleNumber,
      brandId,
      price,
      discount,
      name, // нове поле
      description,
      imageUrl,
      sizes,
    } = req.body;

    // Перевірка обов’язкових полів (тепер включає name)
    if (
      !articleNumber ||
      !brandId ||
      !price ||
      !name ||
      !description ||
      !imageUrl
    ) {
      return res.status(400).json({
        error:
          "Поля articleNumber, brandId, price, name, description та imageUrl є обов'язковими",
      });
    }

    const [newProduct] = await db
      .insert(products)
      .values({
        articleNumber,
        brandId,
        price,
        discount: discount || 0,
        name, // вставляємо name
        description,
        imageUrl,
      })
      .returning();

    // Якщо передано розміри, додаємо їх у таблицю productSizes
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

// GET /products/:articleNumber
app.get("/products/:articleNumber", async (req, res) => {
  try {
    const { articleNumber } = req.params;
    const product = await db
      .select({
        articleNumber: products.articleNumber,
        name: products.name, // додаємо поле name
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrl: products.imageUrl,
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

//---------------------------------------------------ORDER-ITEMS--------------------------------------------------------------------
// GET /order-items – отримання всіх елементів замовлення
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
    const { orderId, articleNumber, size, quantity } = req.body;

    if (!orderId || !articleNumber || !size || !quantity) {
      return res.status(400).json({
        error: "Поля orderId, articleNumber, size та quantity є обов'язковими",
      });
    }

    const [newOrderItem] = await db
      .insert(orderItems)
      .values({
        orderId,
        articleNumber,
        size,
        quantity,
      })
      .returning();

    res.status(201).json(newOrderItem);
  } catch (error) {
    console.error("Error adding order item:", error);
    res.status(500).json({ error: "Error adding order item" });
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

//------------------------------------------------------------------------------------------------------------------------------------

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.AUTH_GOOGLE_ID,
//       clientSecret: process.env.AUTH_GOOGLE_SECRET,
//       callbackURL: "http://localhost:5000/auth/google/callback",
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         console.log("Google Profile:", profile); // Додано логування

//         if (!profile.emails || profile.emails.length === 0) {
//           return done(new Error("Email not provided by Google"), null);
//         }

//         const email = profile.emails[0].value;
//         console.log("Checking email:", email);

//         const existingUser = await db
//           .select()
//           .from(users)
//           .where(eq(users.email, email))
//           .limit(1)
//           .then((res) => res || []); // Гарантуємо, що буде масив

//         console.log("Existing user found:", existingUser);

//         if (existingUser.length > 0) {
//           return done(null, existingUser[0]);
//         }

//         const newUser = await db
//           .insert(users)
//           .values({
//             email,
//             name: profile.displayName,
//             password: null,
//             roleId: 2,
//           })
//           .returning({
//             userId: users.userId,
//             name: users.name,
//             email: users.email,
//           })
//           .then((res) => res[0]); // Отримуємо перший запис

//         console.log("New user created:", newUser);
//         if (!newUser) {
//           return done(
//             new Error("Не вдалося створити нового користувача"),
//             null
//           );
//         }

//         return done(null, newUser);
//       } catch (error) {
//         console.error("Error in Google Auth:", error);
//         return done(error, null);
//       }
//     }
//   )
// );

// passport.serializeUser((user, done) => {
//   done(null, user.userId);
// });

// passport.deserializeUser(async (id, done) => {
//   const user = await db
//     .select({
//       userId: users.userId,
//       name: users.name,
//       email: users.email,
//     })
//     .from(users)
//     .where(eq(users.userId, id))
//     .limit(1)
//     .then((res) => res[0]);

//   if (!user) {
//     return done(null, false);
//   }

//   return done(null, user);
// });

// app.get("/api/user", async (req, res) => {
//   try {
//     const userId = req.user.userId; // Витягуємо з JWT
//     const user = await db
//       .select({ userId: users.userId, name: users.name, email: users.email })
//       .from(users)
//       .where(eq(users.userId, userId))
//       .limit(1)
//       .then((res) => res[0]);

//     if (!user)
//       return res.status(404).json({ error: "Користувач не знайдений" });

//     res.json(user);
//   } catch (error) {
//     res.status(500).json({ error: "Помилка отримання користувача" });
//   }
// });

// app.put("/api/user", async (req, res) => {
//   try {
//     const { name, email } = req.body;
//     const userId = req.user.userId;

//     if (!name || !email) {
//       return res.status(400).json({ error: "Усі поля обов'язкові!" });
//     }

//     await db.update(users).set({ name, email }).where(eq(users.userId, userId));

//     res.json({ success: true });
//   } catch (error) {
//     res.status(500).json({ error: "Помилка оновлення даних" });
//   }
// });

// app.get(
//   "/auth/google",
//   passport.authenticate("google", { scope: ["profile", "email"] })
// );

// app.get(
//   "/auth/google/callback",
//   passport.authenticate("google", {
//     failureRedirect: "/login",
//     session: false,
//   }),
//   (req, res) => {
//     if (!req.user) {
//       return res.status(500).json({ error: "Authentication failed" });
//     }

//     const token = jwt.sign(
//       { userId: req.user.userId },
//       process.env.JWT_SECRET,
//       { expiresIn: "1h" }
//     );

//     res.redirect(`http://localhost:3000?token=${token}`);
//   }
// );

//-----------------------------------------------------------SERVER-RUN-----------------------------------------------------------------

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
