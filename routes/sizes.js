import express from "express";
import { db } from "../db/index.js"; 
import { productSizes } from "../db/schema.js";


const router = express.Router();

router.get("/sizes", async (req, res) => {
  try {
    const sizes = await db
      .selectDistinct({ size: productSizes.size })
      .from(productSizes)
      .orderBy(productSizes.size);
    res.json(sizes.map((s) => ({ size: s.size, stock: 0 })));
  } catch (error) {
    console.error("Помилка отримання розмірів:", error);
    res.status(500).json({ error: "Не вдалося завантажити розміри" });
  }
});

export default router;
