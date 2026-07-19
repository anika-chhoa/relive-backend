import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { verifyAdmin } from "../middleware/verifyAdmin.js";
import {
  getOverview,
  getAllItems,
  adminDeleteItem,
  getAllUsers,
  toggleSuspendUser,
} from "../controllers/adminController.js";

const router = Router();
router.use(verifyJWT, verifyAdmin);

router.get("/overview", getOverview);
router.get("/items", getAllItems);
router.delete("/items/:id", adminDeleteItem);
router.get("/users", getAllUsers);
router.patch("/users/:id/suspend", toggleSuspendUser);

export default router;