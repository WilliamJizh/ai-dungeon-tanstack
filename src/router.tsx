import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  Link,
} from '@tanstack/react-router'
import { GamePreviewPage } from './pages/GamePreviewPage'
import { BattleScenePage } from './pages/BattleScenePage'

const rootRoute = createRootRoute({
  component: Outlet,
})

function Index() {
  return (
    <div className="p-4 flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h3 className="text-3xl mb-8">Welcome Home!</h3>
      <Link 
        to="/preview" 
        className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
      >
        Go to Game Preview
      </Link>
    </div>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Index,
})

const previewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preview',
  component: GamePreviewPage,
})

const battleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/battle',
  component: BattleScenePage,
})

const routeTree = rootRoute.addChildren([indexRoute, previewRoute, battleRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
