# Pruebas End-to-End (E2E)

Se recomienda automatizar pruebas E2E usando Playwright o Cypress.

## Ejemplo básico con Playwright

1. Instala Playwright:
   ```bash
   npm install --save-dev playwright
   ```
2. Crea el archivo `tests/e2e/cart-recovery.spec.js`:

```js
const { test, expect } = require('@playwright/test');

test('flujo de carrito abandonado', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.fill('#shop-input', 'tienda.myshopify.com');
  await page.click('button[type=submit]');
  await expect(page.locator('#status-shop')).toContainText('tienda.myshopify.com');
  // Simula acciones adicionales...
});
```

3. Ejecuta:
   ```bash
   npx playwright test
   ```

## Recursos
- [Playwright](https://playwright.dev/)
- [Cypress](https://www.cypress.io/)
