import multer from "multer";

export const uploadSingleImageMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("image");

export const uploadMultipleImagesMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).array("images", 10);
