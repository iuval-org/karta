export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): ((...args: Parameters<T>) => void) & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      lastArgs = undefined;
      fn(...args);
    }, delay);
  };

  debounced.flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (lastArgs) {
      const args = lastArgs;
      lastArgs = undefined;
      fn(...args);
    }
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };

  return debounced;
}