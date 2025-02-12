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
CREATE TABLE "favorites" (
	"favoriteId" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"articleNumber" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orderItems" (
	"productOrderId" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"articleNumber" text NOT NULL,
	"size" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orderStatus" (
	"orderStatusId" serial PRIMARY KEY NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"orderId" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"orderStatusId" integer,
	"cartData" jsonb
);
--> statement-breakpoint
CREATE TABLE "productCategories" (
	"productCategoryId" serial PRIMARY KEY NOT NULL,
	"imageUrl" text,
	"articleNumber" text,
	"categoryId" integer
);
--> statement-breakpoint
CREATE TABLE "productSizes" (
	"sizeId" serial PRIMARY KEY NOT NULL,
	"articleNumber" text NOT NULL,
	"size" text NOT NULL,
	"stock" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"articleNumber" text PRIMARY KEY NOT NULL,
	"brandId" integer,
	"price" integer,
	"discount" integer,
	"name" text,
	"description" text,
	"imageUrl" text[]
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"reviewId" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"articleNumber" text,
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
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_articleNumber_products_articleNumber_fk" FOREIGN KEY ("articleNumber") REFERENCES "public"."products"("articleNumber") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_orderId_orders_orderId_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("orderId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_articleNumber_products_articleNumber_fk" FOREIGN KEY ("articleNumber") REFERENCES "public"."products"("articleNumber") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_orderStatusId_orderStatus_orderStatusId_fk" FOREIGN KEY ("orderStatusId") REFERENCES "public"."orderStatus"("orderStatusId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productCategories" ADD CONSTRAINT "productCategories_articleNumber_products_articleNumber_fk" FOREIGN KEY ("articleNumber") REFERENCES "public"."products"("articleNumber") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productCategories" ADD CONSTRAINT "productCategories_categoryId_categories_categoryId_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("categoryId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productSizes" ADD CONSTRAINT "productSizes_articleNumber_products_articleNumber_fk" FOREIGN KEY ("articleNumber") REFERENCES "public"."products"("articleNumber") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_brands_brandId_fk" FOREIGN KEY ("brandId") REFERENCES "public"."brands"("brandId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_articleNumber_products_articleNumber_fk" FOREIGN KEY ("articleNumber") REFERENCES "public"."products"("articleNumber") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_roles_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("roleId") ON DELETE cascade ON UPDATE no action;