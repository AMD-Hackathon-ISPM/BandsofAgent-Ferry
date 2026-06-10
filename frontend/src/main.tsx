import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider, createBrowserRouter } from "react-router-dom"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/providers/auth-provider"
import { QueryProvider } from "@/providers/query-provider"
import { AppLayout } from "@/components/app-shell"
import Home from "@/routes/home"
import Login from "@/routes/login"
import AuthCallback from "@/routes/auth-callback"
import RunView from "@/routes/run"
import NotFound from "@/routes/not-found"
import HarborPreview from "@/routes/harbor-preview"

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/auth/callback", element: <AuthCallback /> },
  { path: "/_harbor", element: <HarborPreview /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "runs/:runId", element: <RunView /> },
    ],
  },
  { path: "*", element: <NotFound /> },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="ferry-theme">
      <AuthProvider>
        <QueryProvider>
          <RouterProvider router={router} />
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
