import '@testing-library/jest-dom'

// Mock Next.js router
//
// El objeto debe tener TODOS los metodos del router real, no solo los que
// usaba el codigo cuando se escribio este mock: si falta uno, el componente
// que lo llame revienta con "router.X is not a function" y el test falla por
// el mock, no por un bug. Paso el 15-sep-2026 con `refresh`, que
// SedeSeleccionadaProvider empezo a usar para re-renderizar el Dashboard
// (server component) al cambiar de sede -- ver SPEC 2.38.
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock NextAuth
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
      },
    },
    status: 'authenticated',
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

// Global fetch mock
global.fetch = jest.fn()

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
})
