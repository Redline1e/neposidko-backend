CREATE TABLE "guestCarts" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" text NOT NULL,
	"articleNumber" text NOT NULL,
	"size" text NOT NULL,
	"quantity" integer NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
