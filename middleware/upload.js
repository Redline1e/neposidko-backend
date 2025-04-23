import multer from "multer";
import fs from "fs";
import path from "path";

// Визначення шляху для зберігання файлів
const uploadDir = "/tmp/uploads";

// Перевірка та створення директорії, якщо вона не існує
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    console.error("Помилка при створенні директорії /tmp/uploads:", err);
  }
}

// Налаштування зберігання файлів
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Фільтр для типів файлів (опціонально)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Непідтримуваний тип файлу"), false);
  }
};

// Ініціалізація multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Обмеження розміру файлу до 5MB
});

export default upload;
