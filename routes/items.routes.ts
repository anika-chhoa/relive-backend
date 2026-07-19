import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import {
  createItem,
  getItems,
  getItemById,
  getMyItems,
  updateItem,
  deleteItem,
} from "../controllers/itemsController.js";

const router = Router();

router.get("/", getItems);
router.get("/mine", verifyJWT, getMyItems); // must be registered before /:id
router.get("/:id", getItemById);
router.post("/", verifyJWT, createItem);
router.put("/:id", verifyJWT, updateItem);
router.delete("/:id", verifyJWT, deleteItem);

export default router;
