# K2 — Sticky Notes con colores y redimensionables

## Contexto
Las sticky notes son la única herramienta de anotación del canvas. Sirven para explicar la organización de archivos, decisiones de edición, o cualquier nota que el usuario quiera dejar. Necesitan ser flexibles: varios colores y tamaño ajustable.

## Requisitos

### Colores
Paleta fija de colores para las sticky notes:

| Color | Hex | Uso típico |
|-------|-----|------------|
| 🟡 Amarillo | `#FFF9C4` | Nota general (default) |
| 🟢 Verde | `#C8E6C9` | Aprobado / listo |
| 🔵 Azul | `#BBDEFB` | Información / referencia |
| 🟠 Naranja | `#FFE0B2` | Pendiente / atención |
| 🔴 Rosa/Rojo | `#F8BBD0` | Urgente / bloqueado |
| 🟣 Morado | `#E1BEE7` | Idea / brainstorming |

- Al crear una sticky, se usa el último color seleccionado o amarillo por defecto
- Click en la sticky → opción para cambiar color (selector simple de 6 colores)
- El color persiste en Firestore

### Redimensionable
- La sticky note se puede agrandar o achicar desde una esquina/bor
- Más grande → entra más texto
- El tamaño persiste en Firestore

### Edición de texto
- Click en la sticky → modo edición inline
- El texto se guarda al hacer click fuera o con Enter (si es single line)
- Soporta texto multilínea (crece con el contenido o scroll si excede el tamaño)

### Comportamiento en canvas
- Se puede mover libremente (como cualquier nodo)
- Se puede eliminar
- Sin autor visible, sin fecha, sin firma
- Sin bordes decorativos ni sombras exageradas

### Persistencia
Guardar en Firestore por sticky note:
```typescript
{
  id: string;
  text: string;
  color: string;       // hex color
  width: number;       // en px
  height: number;      // en px
  x: number;           // posición en canvas
  y: number;           // posición en canvas
  createdAt: number;   // timestamp
}
```

## Criterio de aceptación
- [ ] Crear sticky desde toolbar con color default
- [ ] Click derecho/propiedades → cambiar color entre 6 opciones
- [ ] Redimensionar desde esquina/bor
- [ ] Editar texto inline
- [ ] Mover y eliminar
- [ ] Todo persiste en Firestore (posición, color, tamaño, texto)
- [ ] Tests: crear, cambiar color, redimensionar, editar texto, eliminar
