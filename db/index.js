import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import * as schema from "./schema.js";

dotenv.config();

const client = postgres(process.env.DATABASE_URL, {
  prepare: false, // Вимикаємо prepared statements для режиму "Transaction" у Supabase
  ssl: {
    rejectUnauthorized: false, // Для Supabase це необхідно
  },
});
export const db = drizzle(client, { schema });
