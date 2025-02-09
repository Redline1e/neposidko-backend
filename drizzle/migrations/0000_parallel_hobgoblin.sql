CREATE TABLE "brands" (
	"brandId" serial PRIMARY KEY NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"categoryId" serial PRIMARY KEY NOT NULL,
	"name" text,
	"imageUrl" text
);
--> statement-breakpoint
CREATE TABLE "orderItems" (
	"productOrderId" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"productId" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orderStatus" (
	"orderStatusId" serial PRIMARY KEY NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"cartId" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"orderStatusId" integer,
	"cartData" text
);
--> statement-breakpoint
CREATE TABLE "productCategories" (
	"productCategoryId" serial PRIMARY KEY NOT NULL,
	"imageUrl" text,
	"productId" integer,
	"categoryId" integer
);
--> statement-breakpoint
CREATE TABLE "products" (
	"productId" serial PRIMARY KEY NOT NULL,
	"brandId" integer,
	"price" integer,
	"discount" integer,
	"description" text,
	"imageUrl" text,
	"sizes" text[]
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"reviewId" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"productId" integer,
	"rating" integer,
	"comment" text,
	"reviewDate" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"roleId" serial PRIMARY KEY NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"userId" serial PRIMARY KEY NOT NULL,
	"roleId" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_orderId_orders_cartId_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("cartId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_productId_products_productId_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("productId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_orderStatusId_orderStatus_orderStatusId_fk" FOREIGN KEY ("orderStatusId") REFERENCES "public"."orderStatus"("orderStatusId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productCategories" ADD CONSTRAINT "productCategories_productId_products_productId_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("productId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productCategories" ADD CONSTRAINT "productCategories_categoryId_categories_categoryId_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("categoryId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_brands_brandId_fk" FOREIGN KEY ("brandId") REFERENCES "public"."brands"("brandId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_productId_products_productId_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("productId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_roles_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("roleId") ON DELETE cascade ON UPDATE no action;