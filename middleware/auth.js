import jwt from "jsonwebtoken";
export const authenticate = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1]; //Support of Bearer-tokens
  if (!token) {
    return res.status(403).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = decoded; // Attach user data to request
    next();
  });
};
