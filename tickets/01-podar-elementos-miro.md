# K1 — Podar elementos de diagramación del canvas

## Contexto
Karta no es Miro. No necesita herramientas de diagramación ni comentarios (los sticky notes cubren esa necesidad).

## Qué eliminar

### Componentes a borrar
- `src/components/ShapeNode.tsx` — rectángulos, círculos, diamantes, etc.
- `src/components/TextBox.tsx` — cuadros de texto independientes (no sticky notes)
- `src/components/CommentBadge.tsx` — insignias de comentarios (innecesario, usamos sticky notes)
- `src/components/CommentThread.tsx` — hilos de comentarios (innecesario, usamos sticky notes)

### Tipos de nodo a eliminar en `src/types/nodes.ts`
- `arrow` — flechas de conexión
- `shape` — rectángulos, círculos, etc.
- `textbox` — texto libre no-sticky
- `comment` — comentarios anclados

### Stores a eliminar
- `src/stores/commentStore.ts` — innecesario

### Toolbar
- Remover botones de: flecha, shape, text box, comment mode

### Lo que NO se toca (se queda todo lo demás)
- ✅ `DetailsPanel.tsx` — metadata de archivos
- ✅ `ViewToggle.tsx` — toggle de vista
- ✅ `previewStore.ts` — store de preview
- ✅ Todos los demás componentes y stores

## Criterio de aceptación
- [ ] No hay shapes, arrows, text boxes ni comments en el canvas
- [ ] No hay botones de shape/arrow/text box/comment en la toolbar
- [ ] DetailsPanel, ViewToggle y demás componentes siguen funcionando
- [ ] La app compila sin errores
- [ ] Tests actualizados
