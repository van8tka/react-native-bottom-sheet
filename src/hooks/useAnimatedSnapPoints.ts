import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import type { BottomSheetProps } from '../components/bottomSheet';
import {
  INITIAL_CONTAINER_HEIGHT,
  INITIAL_HANDLE_HEIGHT,
  INITIAL_SNAP_POINT,
} from '../components/bottomSheet/constants';
import { normalizeSnapPoint } from '../utilities';

/**
 * Convert percentage snap points to pixels in screen and calculate
 * the accurate snap points positions.
 */
export const useAnimatedSnapPoints = (
  snapPoints: BottomSheetProps['snapPoints'],
  containerHeight: SharedValue<number>,
  contentHeight: SharedValue<number>,
  handleHeight: SharedValue<number>,
  footerHeight: SharedValue<number>,
  enableDynamicSizing: BottomSheetProps['enableDynamicSizing'],
  maxDynamicContentSize: BottomSheetProps['maxDynamicContentSize']
): [SharedValue<number[]>, SharedValue<number>, SharedValue<boolean>] => {
  const dynamicSnapPointIndex = useSharedValue<number>(-1);

  const normalizedSnapPoints = useDerivedValue(() => {
    // extract snap points from provided props
    const _snapPoints = snapPoints
      ? 'value' in snapPoints
        ? snapPoints.value
        : snapPoints
      : [];

    // Если нет снэп-поинтов, возвращаем пустой массив
    if (_snapPoints.length === 0) {
      return [];
    }

    // Проверяем готовность контейнера
    const isContainerLayoutReady =
      containerHeight.value !== INITIAL_CONTAINER_HEIGHT;

    // Если контейнер не готов, используем высоту экрана как запасной вариант
    const availableHeight = isContainerLayoutReady
      ? containerHeight.value
      : 800; // Запасная высота, если контейнер не готов

    // Нормализуем все предоставленные снэп-поинты
    let _normalizedSnapPoints = _snapPoints.map(snapPoint =>
      normalizeSnapPoint(snapPoint, availableHeight)
    ) as number[];

    // Если динамическое изменение размера отключено, возвращаем нормализованные поинты
    if (!enableDynamicSizing) {
      return _normalizedSnapPoints;
    }

    // Для динамического размера нам нужны реальные высоты
    // Если их нет, используем разумные значения по умолчанию
    const currentHandleHeight = handleHeight.value !== INITIAL_HANDLE_HEIGHT
      ? handleHeight.value
      : 24; // Стандартная высота хендлера

    const currentContentHeight = contentHeight.value !== INITIAL_CONTAINER_HEIGHT
      ? contentHeight.value
      : 200; // Минимальная высота контента

    // Рассчитываем динамический снэп-поинт
    const maxContentHeight = maxDynamicContentSize !== undefined
      ? maxDynamicContentSize
      : availableHeight;

    const dynamicSnapPoint = Math.max(
      0,
      availableHeight - Math.min(
        currentContentHeight + currentHandleHeight,
        maxContentHeight
      )
    );

    // Добавляем динамический поинт, если его нет
    if (!_normalizedSnapPoints.includes(dynamicSnapPoint)) {
      _normalizedSnapPoints.push(dynamicSnapPoint);
    }

    // Сортируем все снэп-поинты (от большего к меньшему)
    _normalizedSnapPoints = _normalizedSnapPoints.sort((a, b) => b - a);

    // Находим индекс динамического поинта
    const index = _normalizedSnapPoints.indexOf(dynamicSnapPoint);
    if (index !== -1) {
      dynamicSnapPointIndex.value = index;
    }

    return _normalizedSnapPoints;
  }, [
    snapPoints,
    containerHeight,
    handleHeight,
    contentHeight,
    footerHeight,
    enableDynamicSizing,
    maxDynamicContentSize,
  ]);

  const hasDynamicSnapPoint = useDerivedValue(() => {
    if (enableDynamicSizing) {
      return true;
    }

    const _snapPoints = snapPoints
      ? 'value' in snapPoints
        ? snapPoints.value
        : snapPoints
      : [];

    if (_snapPoints.length &&
      _snapPoints.some(snapPoint => typeof snapPoint === 'string')) {
      return true;
    }

    return false;
  });

  return [normalizedSnapPoints, dynamicSnapPointIndex, hasDynamicSnapPoint];
};
