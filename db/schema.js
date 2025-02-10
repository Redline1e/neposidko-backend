// import {
//   pgTable,
//   serial,
//   text,
//   integer,
//   foreignKey,
//   jsonb,
// } from "drizzle-orm/pg-core";

// // Roles table
// export const roles = pgTable("roles", {
//   roleId: serial("roleId").primaryKey(),
//   name: text("name"),
// });

// // Users table
// export const users = pgTable("users", {
//   userId: serial("userId").primaryKey(),
//   roleId: integer("roleId")
//     .references(() => roles.roleId, { onDelete: "cascade" })
//     .notNull(),
//   name: text("name").notNull(),
//   email: text("email").notNull().unique(),
//   password: text("password").notNull(),
// });

// // OrderStatus table
// export const orderStatus = pgTable("orderStatus", {
//   orderStatusId: serial("orderStatusId").primaryKey(),
//   name: text("name"),
// });

// // Orders table
// export const orders = pgTable("orders", {
//   orderId: serial("orderId").primaryKey(),
//   userId: integer("userId").references(() => users.userId, {
//     onDelete: "cascade",
//   }),
//   orderStatusId: integer("orderStatusId").references(
//     () => orderStatus.orderStatusId,
//     { onDelete: "set null" }
//   ),
//   cartData: jsonb("cartData"),
// });

// // Brands table (підняв вище, бо використовується в products)
// export const brands = pgTable("brands", {
//   brandId: serial("brandId").primaryKey(),
//   name: text("name"),
// });

// // Products table
// export const products = pgTable("products", {
//   articleNumber: serial("articleNumber").primaryKey(),
//   brandId: integer("brandId").references(() => brands.brandId, {
//     onDelete: "set null",
//   }),
//   price: integer("price"),
//   discount: integer("discount"),
//   description: text("description"),
//   imageUrl: text("imageUrl"),
//   sizes: text("sizes").array(),
// });

// // Reviews table
// export const reviews = pgTable("reviews", {
//   reviewId: serial("reviewId").primaryKey(),
//   userId: integer("userId").references(() => users.userId, {
//     onDelete: "cascade",
//   }),
//   articleNumber: integer("articleNumber").references(() => products.articleNumber, {
//     onDelete: "cascade",
//   }),
//   rating: integer("rating"),
//   comment: text("comment"),
//   reviewDate: text("reviewDate"),
// });

// // Categories table
// export const categories = pgTable("categories", {
//   categoryId: serial("categoryId").primaryKey(),
//   name: text("name"),
//   imageUrl: text("imageUrl"),
// });

// // ProductOrder table (змінив ім'я таблиці на `orderItems` для кращого розуміння)
// export const orderItems = pgTable("orderItems", {
//   productOrderId: serial("productOrderId").primaryKey(),
//   orderId: integer("orderId")
//     .references(() => orders.orderId, { onDelete: "cascade" })
//     .notNull(),
//   articleNumber: integer("articleNumber")
//     .references(() => products.articleNumber, { onDelete: "cascade" })
//     .notNull(),
//   quantity: integer("quantity").notNull(),
// });

// // ProductCategories table
// export const productCategories = pgTable("productCategories", {
//   productCategoryId: serial("productCategoryId").primaryKey(),
//   imageUrl: text("imageUrl"),
//   articleNumber: integer("articleNumber").references(() => products.articleNumber, {
//     onDelete: "cascade",
//   }),
//   categoryId: integer("categoryId").references(() => categories.categoryId, {
//     onDelete: "cascade",
//   }),
// });

import {
  pgTable,
  serial,
  text,
  integer,
  foreignKey,
  jsonb,
} from "drizzle-orm/pg-core";


// Roles table
export const roles = pgTable("roles", {
  roleId: serial("roleId").primaryKey(),
  name: text("name"),
});

// Users table
export const users = pgTable("users", {
  userId: serial("userId").primaryKey(),
  roleId: integer("roleId")
    .references(() => roles.roleId, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
});

// OrderStatus table
export const orderStatus = pgTable("orderStatus", {
  orderStatusId: serial("orderStatusId").primaryKey(),
  name: text("name"),
});

// Orders table
export const orders = pgTable("orders", {
  orderId: serial("orderId").primaryKey(),
  userId: integer("userId").references(() => users.userId, {
    onDelete: "cascade",
  }),
  orderStatusId: integer("orderStatusId").references(
    () => orderStatus.orderStatusId,
    { onDelete: "set null" }
  ),
  cartData: jsonb("cartData"),
});

// Brands table
export const brands = pgTable("brands", {
  brandId: serial("brandId").primaryKey(),
  name: text("name"),
});

// Products table
export const products = pgTable("products", {
  articleNumber: text("articleNumber").primaryKey(),
  brandId: integer("brandId").references(() => brands.brandId, {
    onDelete: "set null",
  }),
  price: integer("price"),
  discount: integer("discount"),
  name: text("name"),
  description: text("description"),
  imageUrl: text("imageUrl"),
});

// ProductSizes table (новий підхід для збереження розмірів)
export const productSizes = pgTable("productSizes", {
  sizeId: serial("sizeId").primaryKey(),
  articleNumber: text("articleNumber")
    .references(() => products.articleNumber, { onDelete: "cascade" })
    .notNull(),
  size: text("size").notNull(), // Наприклад: "42", "43", "L", "M"
  stock: integer("stock").notNull(), // Кількість у наявності
});

// Reviews table
export const reviews = pgTable("reviews", {
  reviewId: serial("reviewId").primaryKey(),
  userId: integer("userId").references(() => users.userId, {
    onDelete: "cascade",
  }),
  articleNumber: text("articleNumber").references(
    () => products.articleNumber,
    {
      onDelete: "cascade",
    }
  ),
  rating: integer("rating"),
  comment: text("comment"),
  reviewDate: text("reviewDate"),
});

// Categories table
export const categories = pgTable("categories", {
  categoryId: serial("categoryId").primaryKey(),
  name: text("name"),
  imageUrl: text("imageUrl"),
});

// OrderItems table (додано поле `size` для вибору розміру при замовленні)
export const orderItems = pgTable("orderItems", {
  productOrderId: serial("productOrderId").primaryKey(),
  orderId: integer("orderId")
    .references(() => orders.orderId, { onDelete: "cascade" })
    .notNull(),
  articleNumber: text("articleNumber")
    .references(() => products.articleNumber, { onDelete: "cascade" })
    .notNull(),
  size: text("size").notNull(), // Розмір товару, який замовили
  quantity: integer("quantity").notNull(),
});

// ProductCategories table
export const productCategories = pgTable("productCategories", {
  productCategoryId: serial("productCategoryId").primaryKey(),
  imageUrl: text("imageUrl"),
  articleNumber: text("articleNumber").references(
    () => products.articleNumber,
    {
      onDelete: "cascade",
    }
  ),
  categoryId: integer("categoryId").references(() => categories.categoryId, {
    onDelete: "cascade",
  }),
});
