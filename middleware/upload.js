import multer from "multer";
import fs from "fs";
import path from "path";

const uploadDir = "/tmp/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Непідтримуваний тип файлу"), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Готові middleware — без .single()/.array() у роуті
export const uploadMultipleImages = upload.array("images", 5);
export const uploadSingleImage = upload.single("image");
export const uploadExcel = upload.single("file");

export default upload;
