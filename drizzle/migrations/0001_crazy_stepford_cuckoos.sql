ALTER TABLE "orders" ADD COLUMN "orderDate" timestamp DEFAULT now() NOT NULL;