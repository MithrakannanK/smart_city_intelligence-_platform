const express = require("express");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const User = require("../models/User");

const loginSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).optional(),
  language: z.enum(["en", "ta"]).optional(),
});

function getJwtSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-me";
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), language: user.language || "en", city: user.city || "" },
    getJwtSecret(),
    { expiresIn: "30d" }
  );
}

function tryDecodeUserFromAuthHeader(req) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  const token = parts[1];
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

const authRoutes = express.Router();

authRoutes.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid login payload", details: parsed.error.flatten() });
  }

  const { email, displayName, language } = parsed.data;

  try {
    let user = null;
    if (email) {
      user = await User.findOne({ email }).exec();
    }

    if (!user) {
      user = await User.create({
        email: email || undefined,
        displayName: displayName || (email ? email.split("@")[0] : "Guest"),
        language: language || "en",
      });
    } else {
      user.displayName = displayName || user.displayName;
      user.language = language || user.language || "en";
      await user.save();
    }

    const token = signToken(user);
    return res.json({ token, user: { id: String(user._id), language: user.language, city: user.city } });
  } catch (err) {
    // If Mongo isn't available, still allow guest access to keep emergency flows functional.
    const dummyId = `guest_${Math.random().toString(16).slice(2)}`;
    const token = jwt.sign({ sub: dummyId, language: language || "en" }, getJwtSecret(), { expiresIn: "30d" });
    return res.json({ token, user: { id: dummyId, language: language || "en", city: "" } });
  }
});

authRoutes.get("/me", async (req, res) => {
  const decoded = tryDecodeUserFromAuthHeader(req);
  if (!decoded?.sub) return res.status(401).json({ error: "Missing/invalid token" });
  try {
    const user = await User.findById(decoded.sub).exec();
    if (!user) return res.json({ user: { id: decoded.sub, language: decoded.language || "en", city: decoded.city || "" } });
    return res.json({ user: { id: String(user._id), language: user.language, city: user.city || "" } });
  } catch {
    return res.json({ user: { id: decoded.sub, language: decoded.language || "en", city: decoded.city || "" } });
  }
});

module.exports = { authRoutes };

