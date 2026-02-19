import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  Link,
} from '@tanstack/react-router'
import { HomePage } from './pages/HomePage'
import { NewGamePage } from './pages/NewGamePage'
import { GameSessionPage } from './pages/GameSessionPage'

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-logo">
          <span className="logo-icon">⚔️</span>
          <span className="logo-text">AI Dungeon</span>
        </Link>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const newGameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/new-game',
  component: NewGamePage,
})

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/game/$sessionId',
  component: GameSessionPage,
})

const routeTree = rootRoute.addChildren([indexRoute, newGameRoute, gameRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
