import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // ─── App ──────────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  // ─── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: Joi.string().required(),

  // ─── Auth / JWT ───────────────────────────────────────────────────────────
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  DEFAULT_MEMBER_PASSWORD: Joi.string().required(),

  // ─── Field encryption (Aadhaar / PAN) ─────────────────────────────────────
  // Required in production; without it only the legacy public fallback key exists.
  FIELD_ENCRYPTION_KEY: Joi.string().min(32).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // ─── SMS ──────────────────────────────────────────────────────────────────
  SMS_GATEWAY_KEY: Joi.string().required(),

  // ─── Email / SMTP ─────────────────────────────────────────────────────────
  EMAIL_SMTP_HOST: Joi.string().required(),
  EMAIL_SMTP_PORT: Joi.number().default(587),
  EMAIL_SMTP_USER: Joi.string().email().required(),
  EMAIL_SMTP_PASS: Joi.string().required(),

  // ─── CORS ─────────────────────────────────────────────────────────────────
  FRONTEND_ORIGIN: Joi.string().uri().required(),

  // ─── File storage ─────────────────────────────────────────────────────────
  /** Directory for statement PDFs and member attachments. Keep it outside any web-served path. */
  UPLOAD_DIR: Joi.string().default('storage'),

  // ─── Swagger ──────────────────────────────────────────────────────────────
  SWAGGER_ENABLED: Joi.boolean().default(true),
});
