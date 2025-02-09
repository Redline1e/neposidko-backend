import {
  pgTable,
  serial,
  text,
  integer,
  foreignKey,
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
  cartId: serial("cartId").primaryKey(),
  userId: integer("userId").references(() => users.userId, {
    onDelete: "cascade",
  }),
  orderStatusId: integer("orderStatusId").references(
    () => orderStatus.orderStatusId,
    { onDelete: "set null" }
  ),
  cartData: text("cartData"),
});

// Brands table (підняв вище, бо використовується в products)
export const brands = pgTable("brands", {
  brandId: serial("brandId").primaryKey(),
  name: text("name"),
});

// Products table
export const products = pgTable("products", {
  productId: serial("productId").primaryKey(),
  brandId: integer("brandId").references(() => brands.brandId, {
    onDelete: "set null",
  }),
  price: integer("price"),
  discount: integer("discount"),
  description: text("description"),
  imageUrl: text("imageUrl"),
  sizes: text("sizes").array(),
});

// Reviews table
export const reviews = pgTable("reviews", {
  reviewId: serial("reviewId").primaryKey(),
  userId: integer("userId").references(() => users.userId, {
    onDelete: "cascade",
  }),
  productId: integer("productId").references(() => products.productId, {
    onDelete: "cascade",
  }),
  rating: integer("rating"),
  comment: text("comment"),
  reviewDate: text("reviewDate"),
});

// Categories table
export const categories = pgTable("categories", {
  categoryId: serial("categoryId").primaryKey(),
  name: text("name"),
});

// ProductOrder table (змінив ім'я таблиці на `orderItems` для кращого розуміння)
export const orderItems = pgTable("orderItems", {
  productOrderId: serial("productOrderId").primaryKey(),
  orderId: integer("orderId")
    .references(() => orders.cartId, { onDelete: "cascade" })
    .notNull(),
  productId: integer("productId")
    .references(() => products.productId, { onDelete: "cascade" })
    .notNull(),
  quantity: integer("quantity").notNull(),
});

// ProductCategories table
export const productCategories = pgTable("productCategories", {
  productCategoryId: serial("productCategoryId").primaryKey(),
  productId: integer("productId").references(() => products.productId, {
    onDelete: "cascade",
  }),
  categoryId: integer("categoryId").references(() => categories.categoryId, {
    onDelete: "cascade",
  }),
});
