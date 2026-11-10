import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "../index.css"
import { PatchNotesApp } from "./PatchNotesApp.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PatchNotesApp />
  </StrictMode>
)
