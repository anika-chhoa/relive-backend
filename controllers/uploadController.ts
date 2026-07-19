import type { Request, Response } from "express";
import cloudinary from "../config/cloudinary.js";

// Generates a short-lived signature so the browser can upload directly
// to Cloudinary without ever seeing the API secret.
function signForFolder(folder: string) {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET as string
  );
  return {
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
  };
}

export function getAvatarUploadSignature(req: Request, res: Response) {
  res.json(signForFolder("relive/avatars"));
}

export function getItemUploadSignature(req: Request, res: Response) {
  res.json(signForFolder("relive/items"));
}
