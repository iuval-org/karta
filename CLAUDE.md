# Karta — CLAUDE.md / AGENTS.md

Este archivo es leído automáticamente por OpenCode, Claude Code y Codex al arrancar en este repo.

## Stack
Vite + React + Tailwind v4 + Firebase Hosting + Google Drive API + React Flow (@xyflow/react) + Zustand + Dexie.js
Proyecto Firebase: `karta-file-canvas`

## Principios de Ingeniería (obligatorios)

### YAGNI
- No agregues funcionalidad hasta que el ticket activo la exija
- No crees abstracciones "por si acaso"
- No agregues config genérica para futuros proveedores
- No crees componentes UI reusables sin 2+ usos concretos

### KISS
- Menos capas, menos archivos, menos dependencias = mejor
- Prefiere fetch() nativo sobre axios, sqlite sobre PostgreSQL
- Código lineal > código abstracto
- Nombres que se entienden sin comentarios

### DRY
- 1 repetición → dejalo (YAGNI gana)
- 2 repeticiones → evaluá si es coincidencia o dominio compartido
- 3+ repeticiones → extraé a función compartida

### TDD
- Rojo → Verde → Refactor
- Tests primero, código después
- Cada ticket incluye tests mínimos

## Diseño UI (inspirado en Miro)

### Paleta Karta
| Elemento | Color |
|----------|-------|
| Canvas background | `#F7F9FA` |
| Cards/sidebar/toolbar bg | `#FFFFFF` |
| Folder fill (expanded) | `#EEF2F6` |
| Accent primary | `#2563EB` |
| Accent hover | `#1D4ED8` |
| Borders | `#E5E7EB` / `#D1D5DB` |
| Text primary | `#1F2937` |
| Text secondary | `#6B7280` |

### Sombras permitidas
```css
box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06);
```

### 🚨 Anti-patrones (NUNCA usar)
- ❌ NO gradients (`bg-gradient-to-*`)
- ❌ NO `animate-pulse` (excepto skeleton loading)
- ❌ NO `hover:scale` — usar `hover:-translate-y-0.5` + `hover:shadow-md`
- ❌ NO `backdrop-blur`
- ❌ NO colores pastel de fondo
- ❌ NO sombras exageradas (`shadow-xl`, `shadow-2xl`)
- ❌ NO decoraciones circulares/burbujas flotantes
- ❌ NO `blur-3xl` en fondos

### Layout (estilo Miro)
- Toolbar flotante top-center (absolute, bg-white, rounded-xl, shadow)
- Sidebar minimalista colapsable (bg-white, thin dividers #E5E7EB)
- Zoom controls flotantes bottom-left (tarjeta white, rounded-xl)
- Dot-grid background: `radial-gradient(circle, #D1D5DB 1px, transparent 1px)`
- File cards: vertical, rounded-2xl, icono tipo + metadata
- Folder expandido: bounding box con header tab + fill #EEF2F6

## Patrones Karta

### React Flow
- `panOnDrag={[1]}` — click izquierdo para pan
- `selectionOnDrag={true}` + `SelectionMode.Partial` — multi-selection
- `multiSelectionKeyCode="Shift"` — Shift+click
- NodeResizer con `border-[6px]` transparente para área de agarre
- `node.zIndex` para orden — calcular min/max global

### Google Drive
- Scope: `https://www.googleapis.com/auth/drive` (full access)
- Mover archivos: `files.update` con `addParents`/`removeParents`
- Detectar cambios: Drive Changes API (`getStartPageToken`, `changes.list`)
- Upload: multipart form con metadata + file

### Persistencia
- Firestore como source of truth (colección `/users/{userId}/positions/`)
- Dexie como cache local + offline fallback
- OperationQueue con debounce 2s, dedup por fileId, backoff en 429

### Sync
- Al expandir carpeta: consultar Drive Changes API
- PageToken guardado en Dexie (tabla `syncState`)
- Cambios quirúrgicos: crear/eliminar/renombrar nodos sin recargar

## Convenios de código
- TypeScript estricto (`noUnusedLocals: true`)
- Imports no usados → error de build
- Tests: Vitest + React Testing Library
- Mock gapi para tests de Drive
- Zustand para stores (canvasStore, authStore, navigationStore)
