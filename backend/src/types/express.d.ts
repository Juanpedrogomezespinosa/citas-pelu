import type { Rol } from '../models/usuario.model.js';

declare global {
  namespace Express {
    interface AuthUser {
      id: number;
      nombre: string;
      email: string;
      rol: Rol;
    }

    interface Request {
      /** Usuario autenticado (lo rellena `authenticate`) */
      user?: AuthUser;
      /** Entradas ya validadas y transformadas por `validate()` */
      validatedBody?: unknown;
      validatedQuery?: unknown;
      validatedParams?: unknown;
      /** Cuerpo sin parsear: necesario para verificar la firma de Meta */
      rawBody?: Buffer;
    }
  }
}

export {};
