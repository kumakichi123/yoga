// src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { registerSW } from 'virtual:pwa-register';
import { ensureAnonymousId } from "../lib/anonymous";
import Shell from "./ui/Shell";
import Yoga from "./pages/Yoga";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Cancel from "./pages/Cancel";
import PlayPage from "./pages/PlayPage";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Commerce from "./pages/Commerce";
import AuthPage from "./pages/Auth";
import PoseDetail from "./pages/PoseDetail";

ensureAnonymousId();

registerSW({ immediate: true });

const router = createBrowserRouter([
  { path: "/", element: <Shell />, children: [
    { index: true, element: <Yoga/> },
    { path: "history", element: <History/> },
    { path: "settings", element: <Settings/> },
    { path: "settings/cancel", element: <Cancel/> },
  ]},
  { path: "/auth", element: <AuthPage/> },
  { path: "/pose/:slug", element: <PoseDetail/> },
  { path: "/play/:slug", element: <PlayPage/> },
  { path: "/legal/terms", element: <Terms/> },
  { path: "/legal/privacy", element: <Privacy/> },
  { path: "/legal/commerce", element: <Commerce/> },
]);

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);

