import { ArgumentsHost, Catch, CallHandler, ExecutionContext, ExceptionFilter, HttpException, Injectable, Logger, NestInterceptor, PipeTransform, INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { map } from "rxjs";
import { ZodError, ZodTypeAny, z } from "zod";
import { JwtService } from "@nestjs/jwt";
import { cfg } from "./config";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public details: unknown = {}) { super(message); }
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(map((data) => ({ success: true, data: data ?? null, meta: { requestId: req.requestId } })));
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private log = new Logger("Errors");
  catch(e: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(); const req = http.getRequest(); const res = http.getResponse();
    let status = 500, code = "INTERNAL_ERROR", message = "Something went wrong", details: unknown = {};
    if (e instanceof AppError) ({ status, code, message, details } = e);
    else if (e instanceof ZodError) { status = 422; code = "VALIDATION_ERROR"; message = "Request validation failed"; details = e.flatten(); }
    else if (e instanceof HttpException) { status = e.getStatus(); code = status === 404 ? "NOT_FOUND" : status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "HTTP_ERROR"; message = e.message; }
    else this.log.error(`[${req.requestId}] ${(e as Error)?.stack ?? e}`);
    res.status(status).json({ success: false, error: { code, message, details }, meta: { requestId: req.requestId } });
  }
}

export class ZodPipe implements PipeTransform {
  constructor(private schema: ZodTypeAny) {}
  transform(v: unknown) { return this.schema.parse(v); }
}
export const parse = <T extends ZodTypeAny>(s: T, v: unknown): z.infer<T> => s.parse(v);

/** Shared by main.ts and tests so both run the identical pipeline. */
export function configureApp(app: INestApplication) {
  const jwt = new JwtService({ secret: cfg().jwtSecret });
  app.setGlobalPrefix("v1");
  app.enableCors({ origin: true });
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new ErrorFilter());
  app.use((req: any, res: any, next: () => void) => {
    req.requestId = String(req.headers["x-request-id"] ?? randomUUID()); res.setHeader("x-request-id", req.requestId);
    const h = String(req.headers.authorization ?? "");
    if (h.startsWith("Bearer ")) {
      try { // staff tokens (aud=admin) never act as shoppers, and shopper tokens never act as staff
        const t = jwt.verify<{ sub: string; aud?: string; role?: string }>(h.slice(7));
        if (t.aud === "admin") req.staff = { id: t.sub, role: t.role }; else req.userId = t.sub;
      } catch { /* invalid token = anonymous */ }
    }
    next();
  });
}
