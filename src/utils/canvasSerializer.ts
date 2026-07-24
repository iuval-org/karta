/**
 * Canvas Serializer
 *
 * Serializa/deserializa el canvas completo (nodos + edges) a/desde JSON
 * para persistir en ._karta/state.json de Google Drive.
 *
 * Guarda TODO: tipo de nodo, posición, tamaño, datos específicos
 * (shapeType, color, texto, driveItem, etc.).
 *
 * Cada folder tiene su propio state.json con solo los items DENTRO de esa carpeta.
 */
import type { Node, Edge } from '@xyflow/react';
import type { CanvasNodeData } from '../stores/canvasStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  zIndex?: number;
  selected?: boolean;
  data: Record<string, unknown>;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
  style?: Record<string, unknown>;
  markerEnd?: Record<string, unknown>;
  interactionWidth?: number;
}

export interface KartaState {
  version: number;
  updatedAt: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Convierte nodos y edges de React Flow al formato serializable para Drive.
 * Extrae solo lo que necesitamos, omitiendo Runtime de React Flow.
 */
export function serializeCanvas(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): KartaState {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    nodes: nodes.map(serializeNode),
    edges: edges.map(serializeEdge),
  };
}

function serializeNode(node: Node<CanvasNodeData>): SerializedNode {
  const serialized: SerializedNode = {
    id: node.id,
    type: node.type ?? 'default',
    position: { x: node.position.x, y: node.position.y },
    width: node.width,
    height: node.height,
    zIndex: node.zIndex,
    data: {},
  };

  // Preservar datos según el tipo de nodo
  if (node.data) {
    const { driveItem, ...rest } = node.data as Record<string, unknown>;
    if (driveItem) {
      serialized.data.driveItem = driveItem;
    }
    // Guardar resto de datos (shapeType, text, color, etc.)
    Object.assign(serialized.data, rest);
  }

  return serialized;
}

function serializeEdge(edge: Edge): SerializedEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    type: edge.type,
    style: edge.style as Record<string, unknown> | undefined,
    markerEnd: edge.markerEnd as Record<string, unknown> | undefined,
    interactionWidth: edge.interactionWidth,
  };
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

/**
 * Restaura nodos y edges de React Flow desde el formato guardado en Drive.
 */
export function deserializeCanvas(state: KartaState): {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
} {
  if (!state || !Array.isArray(state.nodes)) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node<CanvasNodeData>[] = state.nodes.map(deserializeNode);
  const edges: Edge[] = (state.edges ?? []).map(deserializeEdge);

  return { nodes, edges };
}

function deserializeNode(sn: SerializedNode): Node<CanvasNodeData> {
  return {
    id: sn.id,
    type: sn.type,
    position: sn.position,
    width: sn.width,
    height: sn.height,
    zIndex: sn.zIndex ?? 0,
    selected: sn.selected ?? false,
    data: sn.data as CanvasNodeData,
  };
}

function deserializeEdge(se: SerializedEdge): Edge {
  return {
    id: se.id,
    source: se.source,
    target: se.target,
    sourceHandle: se.sourceHandle ?? undefined,
    targetHandle: se.targetHandle ?? undefined,
    label: se.label,
    type: se.type ?? 'smoothstep',
    style: se.style as React.CSSProperties | undefined,
    markerEnd: se.markerEnd as unknown as Edge['markerEnd'],
    interactionWidth: se.interactionWidth ?? 10,
  };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

/**
 * Filtra nodos que pertenecen a una carpeta específica.
 * Un nodo pertenece a una carpeta si su driveItem.parentId === folderId.
 * Si folderId es 'root', incluye items sin parentId que pertenezcan al root
 * folder seleccionado por el usuario (rootFolderId).
 * Los nodos nativos (sticky) siempre pertenecen a la carpeta actual.
 */
export function filterNodesByFolder(
  nodes: Node<CanvasNodeData>[],
  folderId: string,
  rootFolderId?: string | null,
): Node<CanvasNodeData>[] {
  return nodes.filter((n) => {
    const type = n.type;

    // Nodos nativos del canvas (post-its)
    // siempre se guardan en el state.json de la carpeta donde están
    if (
      type === 'stickyNote'
    ) {
      return true;
    }

    // Archivos/carpetas de Drive
    const item = n.data?.driveItem;
    if (!item) return true; // si no tiene driveItem, se guarda igual

    if (folderId === 'root') {
      // Root level: include items with no parentId, parentId === 'root',
      // or parentId === rootFolderId (user's selected root folder)
      if (!item.parentId || item.parentId === 'root') return true;
      if (rootFolderId && item.parentId === rootFolderId) return true;
      return false;
    }
    return item.parentId === folderId;
  });
}
