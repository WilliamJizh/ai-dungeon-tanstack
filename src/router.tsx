import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  Link,
} from '@tanstack/react-router'
import { GamePreviewPage } from './pages/GamePreviewPage'
import { BattleScenePage } from './pages/BattleScenePage'
import { VNBuildPage } from './pages/VNBuildPage'
import { VNEnginePage } from './pages/VNEnginePage'
import { VNProjectsPage } from './pages/VNProjectsPage'
import { VNFramePreviewPage } from './pages/VNFramePreviewPage'
import { TraceDebugPage } from './pages/TraceDebugPage'
import { VNProvider } from './context/VNContext'

const rootRoute = createRootRoute({
  component: () => (
    <VNProvider>
      <Outlet />
    </VNProvider>
  ),
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

const vnPlanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vn',
  component: VNBuildPage,
})

const vnPlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vn/play',
  component: VNEnginePage,
})

const vnProjectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vn/projects',
  component: VNProjectsPage,
})

const vnFramePreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vn/frames',
  component: VNFramePreviewPage,
})

const debugTracesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/debug/traces',
  component: TraceDebugPage,
})

const routeTree = rootRoute.addChildren([indexRoute, previewRoute, battleRoute, vnPlanRoute, vnPlayRoute, vnProjectsRoute, vnFramePreviewRoute, debugTracesRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
