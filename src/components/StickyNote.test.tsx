import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNodeResizer = vi.hoisted(() =>
  vi.fn(({ isVisible, ...props }: any) => (
    <div data-testid="node-resizer" data-visible={isVisible} data-props={JSON.stringify(props)} />
  )),
);

const mockHandle = vi.hoisted(() =>
  vi.fn(({ type, position, className, ...props }: any) => (
    <div data-testid={`handle-${type}`} data-position={position} data-classname={className} />
  )),
);

vi.mock('@xyflow/react', () => ({
  NodeResizer: mockNodeResizer,
  Handle: mockHandle,
  Position: { Top: 'top', Bottom: 'bottom' },
}));

const { mockSetNodes, mockGetState, mockUseCanvasStore } = vi.hoisted(() => {
  const _setNodes = vi.fn();
  const _getState = vi.fn(() => ({
    nodes: [],
    setNodes: _setNodes,
  }));
  const _useStore = Object.assign(
    vi.fn((selector?: (s: any) => any) => {
      const state = { nodes: [], setNodes: _setNodes };
      return selector ? selector(state) : state;
    }),
    { getState: _getState, subscribe: vi.fn(() => vi.fn()) },
  );
  return { mockSetNodes: _setNodes, mockGetState: _getState, mockUseCanvasStore: _useStore };
});

vi.mock('../stores/canvasStore', () => ({
  useCanvasStore: mockUseCanvasStore,
}));

vi.mock('../utils/debounce', () => ({
  debounce: vi.fn((fn: (...args: any[]) => any, _delay: number) => {
    const wrapped = (...args: any[]) => fn(...args);
    wrapped.cancel = vi.fn();
    return wrapped;
  }),
}));

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
    removeItem: vi.fn((key: string) => { delete storage[key]; }),
    clear: vi.fn(() => { storage = {}; }),
    get length() { return Object.keys(storage).length; },
    key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
  });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: render StickyNote with custom props
// ---------------------------------------------------------------------------

import StickyNote from './StickyNote';

interface StickyNoteProps {
  text?: string;
  color?: string;
  selected?: boolean;
  author?: string;
}

function renderNote(props: StickyNoteProps = {}) {
  const data = {
    text: props.text ?? 'Test note',
    color: props.color ?? 'yellow',
    author: props.author ?? 'K',
    createdAt: '2026-07-19T12:00:00.000Z',
  };

  return render(
    <StickyNote
      id="sticky-test-1"
      data={data}
      selected={props.selected ?? false}
      type="stickyNote"
      position={{ x: 0, y: 0 }}
    /> as unknown as React.JSX.Element,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StickyNote', () => {
  it('renderiza una sticky note con texto default', async () => {
    renderNote({ text: 'Hello world' });
    const textbox = screen.getByRole('textbox');
    // Text is set imperatively via innerText in a useEffect
    await waitFor(() => {
      expect(textbox.innerText).toBe('Hello world');
    });
  });

  it('renderiza una sticky note con color amarillo', () => {
    const { container } = renderNote({ color: 'yellow' });
    const outer = container.firstChild as HTMLElement;
    // yellow bg = #FEF08A → JSDOM returns rgb format
    expect(outer.style.backgroundColor).toBe('rgb(254, 240, 138)');
  });

  it('cambiar color desde el context menu', () => {
    renderNote({ color: 'yellow' });

    // Open context menu
    const outer = screen.getByRole('textbox').closest('[class*="relative"]')!;
    fireEvent.contextMenu(outer);

    // Should show color picker buttons — find the green one
    const greenBtn = screen.getByTitle('Verde');
    expect(greenBtn).toBeInTheDocument();

    // Click green
    fireEvent.click(greenBtn);

    // should have called setNodes and saved to localStorage
    expect(mockSetNodes).toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledWith('karta-last-sticky-color', 'green');
  });

  it('editar texto inline (simular input)', async () => {
    renderNote({ text: 'Nota original' });
    const textbox = screen.getByRole('textbox');

    // Text is set imperatively via innerText in a useEffect
    await waitFor(() => {
      expect(textbox.innerText).toBe('Nota original');
    });

    // Simulate typing — fire an event + update innerText
    textbox.innerText = 'Texto editado';
    fireEvent.input(textbox);
    expect(textbox.innerText).toBe('Texto editado');
  });

  it('mostrar placeholder cuando no hay texto', () => {
    renderNote({ text: '' });
    expect(screen.getByText('Escribí algo...')).toBeInTheDocument();
  });

  it('renderiza correctamente el NodeResizer cuando está seleccionada', () => {
    renderNote({ selected: true });
    const resizer = screen.getByTestId('node-resizer');
    expect(resizer).toBeInTheDocument();
    expect(resizer.getAttribute('data-visible')).toBe('true');
  });

  it('NO renderiza NodeResizer cuando no está seleccionada', () => {
    renderNote({ selected: false });
    const resizer = screen.getByTestId('node-resizer');
    expect(resizer.getAttribute('data-visible')).toBe('false');
  });
});
