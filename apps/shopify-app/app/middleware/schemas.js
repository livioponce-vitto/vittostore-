const { z } = require('zod');

// ── Producto ────────────────────────────────────────────────────────────────
const productSchema = z.object({
  shop: z.string().min(3).regex(/\.myshopify\.com$/, 'shop debe terminar en .myshopify.com'),
  title: z.string().min(1).max(255),
  body_html: z.string().max(10000).optional(),
  vendor: z.string().max(100).optional(),
  product_type: z.string().max(100).optional(),
  status: z.enum(['active', 'archived', 'draft']).optional(),
  price: z.coerce.number().positive().optional(),
});

const productUpdateSchema = productSchema.partial().extend({
  shop: z.string().min(3).regex(/\.myshopify\.com$/),
});

// ── Orden ───────────────────────────────────────────────────────────────────
const orderUpdateSchema = z.object({
  shop: z.string().min(3).regex(/\.myshopify\.com$/),
  note: z.string().max(5000).optional(),
  tags: z.string().max(255).optional(),
  email: z.string().email().optional(),
});

const orderCloseSchema = z.object({
  shop: z.string().min(3).regex(/\.myshopify\.com$/),
});

// ── Campaña ──────────────────────────────────────────────────────────────────
const campaignCreateSchema = z.object({
  shop: z.string().min(3).regex(/\.myshopify\.com$/),
  name: z.string().min(1).max(200),
  channel: z.enum(['meta', 'google', 'tiktok']).optional(),
  objective: z.string().max(100).optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  budgetDaily: z.coerce.number().positive().max(100_000_000).optional(),
});

const campaignUpdateSchema = campaignCreateSchema.partial().extend({
  shop: z.string().min(3).regex(/\.myshopify\.com$/),
});

// ── Cart Recovery ────────────────────────────────────────────────────────────
const cartTriggerSchema = z.object({
  phone: z.string().min(8).max(20).regex(/^\+?[0-9]+$/, 'Teléfono inválido').optional(),
  message: z.string().max(1000).optional(),
});

module.exports = {
  productSchema,
  productUpdateSchema,
  orderUpdateSchema,
  orderCloseSchema,
  campaignCreateSchema,
  campaignUpdateSchema,
  cartTriggerSchema,
};