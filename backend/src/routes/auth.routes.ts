import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { cambiarPasswordSchema, loginSchema } from '../dtos/auth.dto.js';
import { authenticateAllowPasswordChange } from '../middleware/auth.middleware.js';
import { loginLimiter } from '../middleware/rate-limit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

export const authRoutes = Router()
  .post('/login', loginLimiter, validate({ body: loginSchema }), AuthController.login)
  .post('/logout', AuthController.logout)
  // Estas tres funcionan aunque el usuario tenga pendiente cambiar la contraseña
  .get('/me', authenticateAllowPasswordChange, AuthController.me)
  .put('/password', authenticateAllowPasswordChange, validate({ body: cambiarPasswordSchema }), AuthController.cambiarPassword)
  .post('/logout-todas', authenticateAllowPasswordChange, AuthController.logoutTodas);
