const { upsertCart, listCarts, markRecovered } = require('../app/services/cartRecovery');

describe('cartRecovery service', () => {
  it('debe crear y recuperar un carrito', () => {
    const checkout = {
      id: 'jest-test-1',
      shop: 'jest-shop',
      email: 'jest@shop.com',
      abandoned_checkout_url: 'https://shop.com/checkout',
      line_items: [],
      total_price: '1000',
      currency: 'CLP',
      updated_at: new Date().toISOString(),
    };
    upsertCart(checkout);
    const carts = listCarts('jest-shop');
    expect(carts.length).toBeGreaterThan(0);
    expect(carts[0].id).toBe('jest-test-1');
    markRecovered('jest-test-1');
    const updated = listCarts('jest-shop').find(c => c.id === 'jest-test-1');
    expect(updated.state).toBe('recovered');
  });
});
