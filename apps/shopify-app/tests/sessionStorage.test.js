const { saveSession, loadSession, deleteSession } = require('../app/services/sessionStorage');

describe('sessionStorage service', () => {
  const session = {
    id: 'jest-session-1',
    shop: 'jest-shop',
    accessToken: 'tokentest',
    isEncrypted: false,
    installedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10000).toISOString(),
  };

  afterAll(() => {
    deleteSession('jest-session-1');
  });

  it('guarda y carga una sesión', () => {
    saveSession(session);
    const loaded = loadSession('jest-session-1');
    expect(loaded).toBeDefined();
    expect(loaded.shop).toBe('jest-shop');
  });

  it('elimina una sesión', () => {
    saveSession(session);
    deleteSession('jest-session-1');
    const loaded = loadSession('jest-session-1');
    expect(loaded).toBeUndefined();
  });

  it('no carga sesión expirada', () => {
    const expired = { ...session, id: 'jest-session-2', expiresAt: new Date(Date.now() - 1000).toISOString() };
    saveSession(expired);
    const loaded = loadSession('jest-session-2');
    expect(loaded).toBeUndefined();
    deleteSession('jest-session-2');
  });
});
