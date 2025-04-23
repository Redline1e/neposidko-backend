import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import * as schema from "./schema.js";

dotenv.config();

let db;

try {
  const client = postgres(process.env.DATABASE_URL, {
    prepare: false,
    ssl: { rejectUnauthorized: false },
  });
  db = drizzle(client, { schema }); 
  console.log("Підключення до бази даних успішне");
} catch (error) {
  console.error("Помилка підключення до бази даних:", error);
  throw error; 
}

export { db }; 
