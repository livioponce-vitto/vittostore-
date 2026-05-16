const { ZodError } = require('zod');

/**
 * Middleware factory: valida req.body contra un schema Zod.
 * Uso: router.post('/', validate(miSchema), handler)
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({
        ok: false,
        error: 'Datos de entrada inválidos',
        fields: errors,
        next: 'Corrige los campos indicados y reintenta.',
      });
    }
    req.body = result.data; // datos sanitizados y tipados
    next();
  };
}

module.exports = { validate };