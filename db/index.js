import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import * as schema from "./schema.js";

dotenv.config();

let db;

try {
  // Визначаємо, чи ми працюємо локально
  const isLocal = process.env.DATABASE_URL?.includes("localhost");

  // SSL вмикаємо лише не на localhost
  const client = postgres(process.env.DATABASE_URL, {
    prepare: false,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  db = drizzle(client, { schema });
  console.log("Підключення до бази даних успішне");
} catch (error) {
  console.error("Помилка підключення до бази даних:", error);
  throw error;
}

export { db };
