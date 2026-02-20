import { type RefObject, useLayoutEffect } from 'react';
import type { View } from 'react-native';
import { isFabricInstalled } from '../utilities/isFabricInstalled';

export type BoundingClientRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * A custom hook that retrieves the bounding client rectangle of a given `ref` element
 * and invokes a handler function with the layout information.
 *
 * This hook is designed to work with React Native's Fabric architecture and provides
 * support for both `unstable_getBoundingClientRect` and `getBoundingClientRect` methods.
 *
 * @param ref - A `RefObject` pointing to a `View` or `null`. The bounding client rectangle
 *              will be retrieved from this reference.
 * @param handler - A callback function that will be invoked with the layout information
 *                  of the referenced element.
 *
 * @remarks
 * - The hook uses `useLayoutEffect` to ensure the layout information is retrieved
 *   after the DOM updates.
 * - The `isFabricInstalled` function is used to determine if the Fabric architecture
 *   is available.
 * - The `unstable_getBoundingClientRect` method is used if available, falling back
 *   to `getBoundingClientRect` otherwise.
 *
 * @example
 * ```tsx
 * const ref = useRef<View | null>(null);
 * useBoundingClientRect(ref, (layout) => {
 *   console.log('Bounding client rect:', layout);
 * });
 * ```
 */
export function useBoundingClientRect(
  ref: RefObject<View | null>,
  handler: (layout: BoundingClientRect) => void
) {

  useLayoutEffect(() => {
    if (!isFabricInstalled()) {
      return;
    }

    if (!ref?.current) {
      return;
    }

    const element = ref.current;

    // ✅ Правильная проверка: существует ли метод и является ли функцией
    if (typeof (element as any).unstable_getBoundingClientRect === 'function') {
      // @ts-ignore - метод существует, но TypeScript не знает о нём
      const layout = element.unstable_getBoundingClientRect();
      handler(layout);
      return;
    }

    // ✅ Проверяем стабильную версию метода
    if (typeof (element as any).getBoundingClientRect === 'function') {
      // @ts-ignore
      const layout = element.getBoundingClientRect();
      handler(layout);
      return;
    }

    // Если ни один метод не доступен
    console.warn('Bounding client rect methods not available on this view');
  }, [ref, handler]);
}
