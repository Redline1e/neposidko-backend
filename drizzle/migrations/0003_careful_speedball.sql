DROP TABLE "guestCarts" CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sessionId" text;