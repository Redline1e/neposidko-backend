import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_DIR = path.join(__dirname, "public", "images");

export const fetchOne = async (query) => {
  const results = await query;
  return results[0];
};

export const deleteFiles = async (filesOrUrls) => {
  const files = Array.isArray(filesOrUrls)
    ? filesOrUrls.map((file) => file.filename || path.basename(file))
    : [filesOrUrls.filename || path.basename(filesOrUrls)];
  const deletePromises = files.map((filename) =>
    fs
      .unlink(path.join(IMAGE_DIR, filename))
      .catch((err) =>
        console.error(`Помилка видалення файлу ${filename}:`, err)
      )
  );
  await Promise.all(deletePromises);
};
