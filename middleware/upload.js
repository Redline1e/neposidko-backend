import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_DIR = path.join(__dirname, "../public/images");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGE_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

export const uploadImages = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Дозволені тільки зображення"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // Обмеження 5 МБ
});

export const uploadSingleImage = uploadImages.single("image");
export const uploadMultipleImages = uploadImages.array("images", 10);
export const uploadExcel = multer({ dest: "uploads/" });
