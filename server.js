import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./db/index.js";
import { products, users, brands } from "./db/schema.js";
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
    // Дані користувача з token
    const { userId, name, email } = req.user;

    // Повертаємо інформацію про користувача
    res.status(200).json({ userId, name, email });
  } catch (error) {
    console.error("Помилка отримання даних користувача:", error);
    res.status(500).json({ error: "Виникла помилка на сервері" });
  }
});

//-------------------------------------------------------PRODUCTS----------------------------------------------------------------------

app.get("/products", async (req, res) => {
  try {
    const allProducts = await db
      .select({
        productId: products.productId,
        price: products.price,
        discount: products.discount,
        description: products.description,
        imageUrl: products.imageUrl,
        brand: brands.name,
        sizes: products.sizes,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.brandId));

    res.json(allProducts);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/products", async (req, res) => {
  try {
    const { brandId, price, discount, description, imageUrl, sizes } = req.body;

    if (!brandId || !price || !description || !imageUrl) {
      return res
        .status(400)
        .json({ error: "Всі поля, окрім знижки та розмірів, обов'язкові" });
    }

    const [newProduct] = await db
      .insert(products)
      .values({
        brandId,
        price,
        discount: discount || 0,
        description,
        imageUrl,
        sizes: sizes || [],
      })
      .returning();

    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ error: "Error adding product" });
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
