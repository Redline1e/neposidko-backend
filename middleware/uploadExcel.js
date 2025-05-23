// middleware/upload.js
import multer from "multer";
import path from "path";

// Налаштування дискового сховища для Excel
const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), "uploads", "excel"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `report-${Date.now()}${ext}`);
  },
});

// Фільтр — приймати тільки .xlsx/.xls
const excelFilter = (req, file, cb) => {
  if (
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel"
  ) {
    cb(null, true);
  } else {
    cb(
      new Error("Невірний формат файлу. Дозволено лише Excel (.xls, .xlsx)"),
      false
    );
  }
};

// Експорт middleware для завантаження Excel-файлу в єдиному екземплярі
export const uploadExcel = multer({
  storage: excelStorage,
  fileFilter: excelFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // до 10MB
});

