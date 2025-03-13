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
import { eq, ilike, and, or } from "drizzle-orm";
import { fileURLToPath } from "url";
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
app.use("/images", express.static(path.join(__dirname, "public", "images")));

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

// Допоміжна функція для видалення файлів
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
    const files = req.files; // Отримуємо масив файлів

    // Перевірка обов’язкових полів
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

    // Формуємо масив URL-адрес для зображень
    const imageUrls = files.map(
      (file) => `${req.protocol}://${req.get("host")}/images/${file.filename}`
    );

    // Додавання продукту в базу даних
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

    // Додавання категорії продукту
    const categoryImageUrl = imageUrls[0];
    await db.insert(productCategories).values({
      articleNumber,
      categoryId: Number(categoryId),
      imageUrl: categoryImageUrl,
    });

    // Додавання розмірів продукту
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
    // Якщо сталася помилка, видаляємо всі завантажені файли
    if (req.files && Array.isArray(req.files)) {
      const deletePromises = req.files.map((file) => {
        const filePath = path.join(
          __dirname,
          "public",
          "images",
          file.filename
        );
        return fs.unlink(filePath).catch((err) => {
          console.error(`Помилка видалення файлу ${filePath}:`, err);
        });
      });
      await Promise.all(deletePromises);
    }
    console.error("Error adding product:", error);
    next(createError(500, "Error adding product"));
  }
});

// Ендпоінт для отримання активних продуктів (isActive: true)
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
      return next(createError(400, "Усі поля продукту обов'язкові"));
    }
    if (!files?.length) {
      return next(
        createError(400, "Потрібно завантажити хоча б одне зображення")
      );
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

    await db.insert(productCategories).values({
      articleNumber,
      categoryId: Number(categoryId),
      imageUrl: imageUrls[0],
    });

    const parsedSizes = sizes ? JSON.parse(sizes) : [];
    if (Array.isArray(parsedSizes)) {
      for (const { size, stock } of parsedSizes) {
        if (!size || stock == null) continue;
        await db
          .insert(productSizes)
          .values({ articleNumber, size, stock: Number(stock) });
      }
    }

    res.status(201).json(newProduct);
  } catch (error) {
    if (req.files?.length) await deleteFiles(req.files);
    console.error("Помилка додавання продукту:", error);
    next(createError(500, "Не вдалося додати продукт"));
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
        category: categories.name, // Назва категорії
        categoryId: categories.categoryId, // Ідентифікатор категорії
      })
      .from(products)
      .where(eq(products.isActive, false)) // Фільтруємо лише неактивні продукти
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .leftJoin(
        productCategories,
        eq(products.articleNumber, productCategories.articleNumber)
      )
      .leftJoin(
        categories,
        eq(productCategories.categoryId, categories.categoryId)
      );

    // Додавання розмірів для кожного товару
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

app.put("/product/:articleNumber", async (req, res, next) => {
  try {
    const { articleNumber } = req.params;
    const {
      brandId,
      price,
      discount,
      name,
      description,
      imageUrls,
      sizes,
      categoryId,
    } = req.body;

    // Оновлення запису в таблиці products
    const [updatedProduct] = await db
      .update(products)
      .set({
        brandId,
        price,
        discount: discount || 0,
        name,
        description,
        imageUrls,
      })
      .where(eq(products.articleNumber, articleNumber))
      .returning();

    if (!updatedProduct) {
      return next(createError(404, "Продукт не знайдено"));
    }

    // Оновлення зв'язку з категорією (якщо categoryId передано)
    if (categoryId) {
      // Видаляємо попередній запис для цього товару
      await db
        .delete(productCategories)
        .where(eq(productCategories.articleNumber, articleNumber));
      // Вставляємо новий запис
      await db.insert(productCategories).values({
        articleNumber,
        categoryId,
        imageUrl: imageUrls[0], // або інше бажане значення
      });
    }

    // Оновлення розмірів:
    if (sizes && Array.isArray(sizes)) {
      // Видаляємо всі існуючі розміри для цього товару
      await db
        .delete(productSizes)
        .where(eq(productSizes.articleNumber, articleNumber));
      // Вставляємо нові записи
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

    res.json(updatedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    next(createError(500, "Не вдалося оновити продукт"));
  }
});

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
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId))
      .where(
        and(
          or(
            ilike(products.name, `%${q}%`),
            ilike(products.articleNumber, `%${q}%`)
          ),
          eq(products.isActive, true)
        )
      );

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
app.put("/categories/:categoryId", async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const { name, imageUrl } = req.body;

    if (!name) {
      return next(createError(400, "Поле назви категорії є обов'язковим"));
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
    console.error("Error updating category:", error);
    next(createError(500, "Не вдалося оновити категорію"));
  }
});

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

//-------------------------------------------------------ORDER-ITEMS----------------------------------------------------------------------

// GET /order-items – отримання позицій замовлення користувача
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
        name: products.name, // додаємо назву товару
        imageUrls: products.imageUrls, // додаємо URL зображень товару
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.orderId))
      .leftJoin(products, eq(orderItems.articleNumber, products.articleNumber))
      .where(eq(orders.userId, userId));
    res.json(userOrderItems);
  } catch (error) {
    console.error("Error fetching order items:", error);
    next(createError(500, "Failed to fetch order items"));
  }
});

// POST /order-items – додавання позиції замовлення
app.post("/order-items", authenticate, async (req, res, next) => {
  try {
    const { articleNumber, size, quantity } = req.body;
    const { userId } = req.user;

    if (!articleNumber || !size || quantity === undefined) {
      return next(
        createError(400, "articleNumber, size and quantity are required")
      );
    }

    // Знаходимо активне замовлення для користувача (orderStatusId = 1)
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
          .values({ userId, orderStatusId: 1 })
          .returning("orderId")
      );
      currentOrder = newOrder;
    }

    // Додаємо позицію до замовлення
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
        return product ? { ...product } : null;
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Сталася внутрішня помилка сервера",
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
