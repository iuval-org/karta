import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useNavigationStore } from '../stores/navigationStore';
import { useTabStore } from '../stores/tabStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useSidebarStore } from '../stores/sidebarStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { useToastStore } from '../stores/toastStore';

/**
 * Global keyboard shortcuts hook.
 *
 * Mounted once in AppContent (inside ReactFlowProvider).
 * Checks that focus is NOT in an input/textarea/select before handling.
 * Delegates all actions to zustand store actions.
 */
export function useKeyboardShortcuts() {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      // ── Skip when focus is in a native input ────────────────
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      ) {
        return;
      }

      // ── Build shortcut combo string ──────────────────────────
      const parts: string[] = [];
      if (e.altKey) parts.push('Alt');
      if (e.ctrlKey || e.metaKey) parts.push('Control');
      // Don't add Shift modifier if the key itself is a shifted char (e.g. '?')
      if (e.shiftKey && e.key !== 'Shift' && e.key !== '?') parts.push('Shift');
      const key = e.key;
      // Skip modifier-only events
      if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return;
      parts.push(key);

      const combo = parts.join('+');

      // ── Shortcut dispatch ────────────────────────────────────
      switch (combo) {
        /* ═══════════════════════════════════════════════════════
           Navegación
           ═══════════════════════════════════════════════════════ */
        case 'Alt+ArrowLeft': {
          e.preventDefault();
          const nav = useNavigationStore.getState();
          if (nav.canGoBack()) nav.goBack();
          return;
        }

        case 'Control+Tab': {
          e.preventDefault();
          const tabState = useTabStore.getState();
          const { tabs, activeTabId, switchTab } = tabState;
          if (tabs.length < 2) return;
          const idx = tabs.findIndex((t) => t.tabId === activeTabId);
          const next = tabs[(idx + 1) % tabs.length];
          switchTab(next.tabId);
          return;
        }

        case 'Control+Shift+Tab': {
          e.preventDefault();
          const tabState = useTabStore.getState();
          const { tabs, activeTabId, switchTab } = tabState;
          if (tabs.length < 2) return;
          const idx = tabs.findIndex((t) => t.tabId === activeTabId);
          const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
          switchTab(prev.tabId);
          return;
        }

        case 'Control+w': {
          e.preventDefault();
          const tabState = useTabStore.getState();
          tabState.closeTab(tabState.activeTabId);
          return;
        }

        /* ═══════════════════════════════════════════════════════
           Canvas
           ═══════════════════════════════════════════════════════ */
        case 'Control+a': {
          e.preventDefault();
          const cs = useCanvasStore.getState();
          cs.setSelectedNodeIds(
            cs.nodes.map((n) => n.id),
          );
          return;
        }

        case 'Escape': {
          useCanvasStore.getState().clearSelection();
          return;
        }

        case 'Control+0': {
          e.preventDefault();
          fitView({ duration: 200 });
          return;
        }

        case 'Control+r': {
          e.preventDefault();
          useCanvasStore.getState().resetLayout();
          return;
        }

        case ']': {
          e.preventDefault();
          useCanvasStore.getState().bringToFront();
          return;
        }

        case '[': {
          e.preventDefault();
          useCanvasStore.getState().sendToBack();
          return;
        }

        /* ═══════════════════════════════════════════════════════
           Archivos
           ═══════════════════════════════════════════════════════ */
        case 'Delete':
        case 'Backspace': {
          const cs = useCanvasStore.getState();
          // Don't stack modals
          if (cs.pendingTrashItemIds.length > 0) return;

          const selectedNodes = cs.nodes.filter((n) => n.selected);
          if (selectedNodes.length === 0) return;

          e.preventDefault();
          const toTrash = selectedNodes
            .map((n) => n.id)
            .filter((id) => id !== 'root');

          if (toTrash.length === 0) {
            useToastStore.getState().addToast({
              type: 'warning',
              message: 'No podés eliminar la carpeta raíz.',
            });
            return;
          }

          if (toTrash.length < selectedNodes.length) {
            useToastStore.getState().addToast({
              type: 'warning',
              message: 'No podés eliminar la carpeta raíz. El resto se eliminará.',
            });
          }

          cs.setPendingTrash(toTrash);
          return;
        }

        case 'F2': {
          e.preventDefault();
          const cs = useCanvasStore.getState();
          const selected = cs.selectedNodeIds;

          if (selected.length === 1) {
            useShortcutStore.getState().triggerRenameNode(selected[0]);
          } else if (selected.length === 0) {
            useToastStore.getState().addToast({
              type: 'info',
              message: 'Seleccioná un archivo para renombrar.',
            });
          } else {
            useToastStore.getState().addToast({
              type: 'info',
              message: 'Seleccioná solo un archivo para renombrar.',
            });
          }
          return;
        }

        case 'Control+k': {
          e.preventDefault();
          const input = document.querySelector<HTMLInputElement>(
            '[aria-label="Buscar archivos"]',
          );
          input?.focus();
          return;
        }

        case 'Control+n': {
          e.preventDefault();
          // Default to folder creation
          useShortcutStore
            .getState()
            .triggerCreateModal('application/vnd.google-apps.folder');
          return;
        }

        /* ═══════════════════════════════════════════════════════
           General
           ═══════════════════════════════════════════════════════ */
        case '?':
        case 'Shift+/': {
          useShortcutStore.getState().toggleHelp();
          return;
        }

        case 'Control+\\': {
          e.preventDefault();
          useSidebarStore.getState().toggle();
          return;
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fitView]);
}
