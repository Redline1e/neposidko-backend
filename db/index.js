import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import * as schema from "./schema.js"; // Import schema tables

dotenv.config();

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });
