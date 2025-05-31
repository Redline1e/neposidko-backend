// middleware/uploadExcel.js

import multer from "multer";

// Використовуємо memoryStorage, щоб не писати файл на диск
const excelStorage = multer.memoryStorage();

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

export const uploadExcel = multer({
  storage: excelStorage,
  fileFilter: excelFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // до 10 МБ
});
