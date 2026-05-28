import invariant from 'invariant';
import React, {
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
  memo,
  useEffect,
} from 'react';
import {Dimensions, type Insets, Platform, StyleSheet} from 'react-native';
import {State} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useSharedValue,
  useDerivedValue,
  interpolate,
  Extrapolation,
  cancelAnimation,
  type WithSpringConfig,
  type WithTimingConfig,
  type SharedValue,
  useReducedMotion,
  ReduceMotion,
} from 'react-native-reanimated';
import {useWorkletCallback} from '../../hooks/useWorkletCallback';
import {
  ANIMATION_SOURCE,
  ANIMATION_STATE,
  KEYBOARD_BEHAVIOR,
  KEYBOARD_BLUR_BEHAVIOR,
  KEYBOARD_INPUT_MODE,
  KEYBOARD_STATE,
  SCROLLABLE_STATE,
  SHEET_STATE,
  SNAP_POINT_TYPE,
} from '../../constants';
import {
  BottomSheetInternalProvider,
  BottomSheetProvider,
} from '../../contexts';
import {
  useAnimatedSnapPoints,
  useKeyboard,
  usePropsValidator,
  useReactiveSharedValue,
  useScrollable,
  useStableCallback,
} from '../../hooks';
import type {BottomSheetMethods} from '../../types';
import {
  animate,
  getKeyboardAnimationConfigs,
  normalizeSnapPoint,
  print,
} from '../../utilities';
// import BottomSheetDebugView from '../bottomSheetDebugView';
import {BottomSheetBackgroundContainer} from '../bottomSheetBackground';
import {BottomSheetFooterContainer} from '../bottomSheetFooter';
import BottomSheetGestureHandlersProvider from '../bottomSheetGestureHandlersProvider';
import {BottomSheetHandleContainer} from '../bottomSheetHandle';
import {BottomSheetHostingContainer} from '../bottomSheetHostingContainer';
import {BottomSheetBody} from './BottomSheetBody';
import {BottomSheetContent} from './BottomSheetContent';
import {
  DEFAULT_ACCESSIBILITY_LABEL,
  DEFAULT_ACCESSIBILITY_ROLE,
  DEFAULT_ACCESSIBLE,
  DEFAULT_ANIMATE_ON_MOUNT,
  DEFAULT_DYNAMIC_SIZING,
  DEFAULT_ENABLE_BLUR_KEYBOARD_ON_GESTURE,
  DEFAULT_ENABLE_CONTENT_PANNING_GESTURE,
  DEFAULT_ENABLE_OVER_DRAG,
  DEFAULT_ENABLE_PAN_DOWN_TO_CLOSE,
  DEFAULT_KEYBOARD_BEHAVIOR,
  DEFAULT_KEYBOARD_BLUR_BEHAVIOR,
  DEFAULT_KEYBOARD_INPUT_MODE,
  DEFAULT_OVER_DRAG_RESISTANCE_FACTOR,
  INITIAL_CONTAINER_HEIGHT,
  INITIAL_CONTAINER_OFFSET,
  INITIAL_HANDLE_HEIGHT,
  INITIAL_POSITION,
  INITIAL_SNAP_POINT,
  INITIAL_VALUE,
} from './constants';
import type {AnimateToPositionType, BottomSheetProps} from './types';
import {runOnJS, scheduleOnUI} from 'react-native-worklets';

if (typeof Animated?.addWhitelistedUIProps === 'function') {
  Animated.addWhitelistedUIProps({
    decelerationRate: true,
  });
}

type BottomSheet = BottomSheetMethods;

const BottomSheetComponent = forwardRef<BottomSheet, BottomSheetProps>(
  function BottomSheet(props, ref) {
    //#region extract props
    const {
      // animations configurations
      animationConfigs: _providedAnimationConfigs,

      // configurations
      index: _providedIndex = 0,
      snapPoints: _providedSnapPoints,
      animateOnMount = DEFAULT_ANIMATE_ON_MOUNT,
      enableContentPanningGesture = DEFAULT_ENABLE_CONTENT_PANNING_GESTURE,
      enableHandlePanningGesture,
      enableOverDrag = DEFAULT_ENABLE_OVER_DRAG,
      enablePanDownToClose = DEFAULT_ENABLE_PAN_DOWN_TO_CLOSE,
      enableDynamicSizing = DEFAULT_DYNAMIC_SIZING,
      overDragResistanceFactor = DEFAULT_OVER_DRAG_RESISTANCE_FACTOR,
      overrideReduceMotion: _providedOverrideReduceMotion,

      // styles
      style,
      containerStyle: _providedContainerStyle,
      backgroundStyle: _providedBackgroundStyle,
      handleStyle: _providedHandleStyle,
      handleIndicatorStyle: _providedHandleIndicatorStyle,

      // hooks
      gestureEventsHandlersHook,

      // keyboard
      keyboardBehavior = DEFAULT_KEYBOARD_BEHAVIOR,
      keyboardBlurBehavior = DEFAULT_KEYBOARD_BLUR_BEHAVIOR,
      android_keyboardInputMode = DEFAULT_KEYBOARD_INPUT_MODE,
      enableBlurKeyboardOnGesture = DEFAULT_ENABLE_BLUR_KEYBOARD_ON_GESTURE,

      // layout
      containerHeight: _providedContainerHeight,
      containerOffset: _providedContainerOffset,
      topInset = 0,
      bottomInset = 0,
      maxDynamicContentSize,

      // animated callback shared values
      animatedPosition: _providedAnimatedPosition,
      animatedIndex: _providedAnimatedIndex,

      // gestures
      simultaneousHandlers: _providedSimultaneousHandlers,
      waitFor: _providedWaitFor,
      activeOffsetX: _providedActiveOffsetX,
      activeOffsetY: _providedActiveOffsetY,
      failOffsetX: _providedFailOffsetX,
      failOffsetY: _providedFailOffsetY,

      // callbacks
      onChange: _providedOnChange,
      onClose: _providedOnClose,
      onAnimate: _providedOnAnimate,

      // private
      $modal = false,
      detached = false,

      // components
      handleComponent,
      backdropComponent: BackdropComponent,
      backgroundComponent,
      footerComponent,
      children,

      // accessibility
      accessible: _providedAccessible = DEFAULT_ACCESSIBLE,
      accessibilityLabel:
        _providedAccessibilityLabel = DEFAULT_ACCESSIBILITY_LABEL,
      accessibilityRole:
        _providedAccessibilityRole = DEFAULT_ACCESSIBILITY_ROLE,
    } = props;
    //#endregion

    //#region validate props
    if (__DEV__) {
      // biome-ignore lint/correctness/useHookAtTopLevel: used in development only.
      usePropsValidator({
        index: _providedIndex,
        snapPoints: _providedSnapPoints,
        enableDynamicSizing,
        topInset,
        bottomInset,
      });
    }
    //#endregion

    //#region layout variables
    /**
     * This variable is consider an internal variable,
     * that will be used conditionally in `animatedContainerHeight`
     */
    const _animatedContainerHeight = useReactiveSharedValue(
      _providedContainerHeight ?? INITIAL_CONTAINER_HEIGHT
    );
    /**
     * This is a conditional variable, where if the `BottomSheet` is used
     * in a modal, then it will subset vertical insets (top+bottom) from
     * provided container height.
     */
    const animatedContainerHeight = useDerivedValue(() => {
      const verticalInset = topInset + bottomInset;
      return $modal
        ? _animatedContainerHeight.get() - verticalInset
        : _animatedContainerHeight.get();
    }, [topInset, bottomInset, $modal, _animatedContainerHeight]);
    const animatedContainerOffset = useReactiveSharedValue(
      _providedContainerOffset ?? INITIAL_CONTAINER_OFFSET
    ) as SharedValue<Required<Insets>>;
    const animatedHandleHeight = useReactiveSharedValue<number>(
      INITIAL_HANDLE_HEIGHT
    );
    const animatedFooterHeight = useSharedValue(0);
    const animatedContentHeight = useSharedValue(INITIAL_CONTAINER_HEIGHT);
    const [animatedSnapPoints, animatedDynamicSnapPointIndex] =
      useAnimatedSnapPoints(
        _providedSnapPoints,
        animatedContainerHeight,
        animatedContentHeight,
        animatedHandleHeight,
        animatedFooterHeight,
        enableDynamicSizing,
        maxDynamicContentSize
      );

    useEffect(() => {
      // Если снэп-поинты всё ещё INITIAL_SNAP_POINT, принудительно обновим их через секунду
      const timer = setTimeout(() => {
        const currentSnapPoints = animatedSnapPoints.get();
        if (currentSnapPoints[0] === INITIAL_SNAP_POINT || currentSnapPoints[0] === -999) {
          // Триггерим пересчет
          animatedSnapPoints.set([...currentSnapPoints]);
        }
      }, 1000);

      return () => clearTimeout(timer);
    }, []);

    const animatedHighestSnapPoint = useDerivedValue(
      () => animatedSnapPoints.get()[animatedSnapPoints.get().length - 1],
      [animatedSnapPoints]
    );
    const animatedClosedPosition = useDerivedValue(() => {
      let closedPosition = animatedContainerHeight.get();

      if ($modal || detached) {
        closedPosition = animatedContainerHeight.get() + bottomInset;
      }

      return closedPosition;
    }, [animatedContainerHeight, $modal, detached, bottomInset]);
    const animatedSheetHeight = useDerivedValue(
      () => animatedContainerHeight.get() - animatedHighestSnapPoint.get(),
      [animatedContainerHeight, animatedHighestSnapPoint]
    );
    const animatedCurrentIndex = useReactiveSharedValue(
      animateOnMount ? -1 : _providedIndex
    );
    const animatedPosition = useSharedValue(INITIAL_POSITION);
    const animatedNextPosition = useSharedValue(INITIAL_VALUE);
    const animatedNextPositionIndex = useSharedValue(INITIAL_VALUE);

    // conditional
    const isAnimatedOnMount = useSharedValue(
      !animateOnMount || _providedIndex === -1
    );
    const isContentHeightFixed = useSharedValue(false);
    const isLayoutCalculated = useDerivedValue(() => {
      let isContainerHeightCalculated = false;

      // Проверяем, что высота контейнера не равна INITIAL
      if (animatedContainerHeight.get() !== INITIAL_CONTAINER_HEIGHT) {
        isContainerHeightCalculated = true;
      }

      // Если передана явно через пропсы
      if (_providedContainerHeight) {
        isContainerHeightCalculated = true;
      }

      let isHandleHeightCalculated = false;

      // Если хендлера нет, считаем высоту вычисленной (0)
      if (handleComponent === null) {
        isHandleHeightCalculated = true;
      } else if (animatedHandleHeight.get() !== INITIAL_HANDLE_HEIGHT) {
        // Если хендлер есть и высота изменилась
        isHandleHeightCalculated = true;
      }

      let isSnapPointsNormalized = false;
      // Проверяем, что первый снэп-поинт не INITIAL_SNAP_POINT
      const firstSnapPoint = animatedSnapPoints.get()[0];
      if (firstSnapPoint !== INITIAL_SNAP_POINT) {
        isSnapPointsNormalized = true;
      }

      const result = isContainerHeightCalculated &&
        isHandleHeightCalculated &&
        isSnapPointsNormalized;

      return result;
    }, [
      _providedContainerHeight,
      animatedContainerHeight,
      animatedHandleHeight,
      animatedSnapPoints,
      handleComponent,
    ]);
    const isInTemporaryPosition = useSharedValue(false);
    const isForcedClosing = useSharedValue(false);
    const animatedContainerHeightDidChange = useSharedValue(false);

    // gesture
    const animatedContentGestureState = useSharedValue<State>(
      State.UNDETERMINED
    );
    const animatedHandleGestureState = useSharedValue<State>(
      State.UNDETERMINED
    );
    //#endregion

    //#region hooks variables
    // scrollable variables
    const {
      animatedScrollableType,
      animatedScrollableContentOffsetY,
      animatedScrollableOverrideState,
      isScrollableRefreshable,
      setScrollableRef,
      removeScrollableRef,
    } = useScrollable();
    // keyboard
    const {
      state: animatedKeyboardState,
      height: animatedKeyboardHeight,
      animationDuration: keyboardAnimationDuration,
      animationEasing: keyboardAnimationEasing,
      shouldHandleKeyboardEvents,
    } = useKeyboard();
    const animatedKeyboardHeightInContainer = useSharedValue(0);
    const userReduceMotionSetting = useReducedMotion();
    const reduceMotion = useMemo(() => {
      return !_providedOverrideReduceMotion ||
      _providedOverrideReduceMotion === ReduceMotion.System
        ? userReduceMotionSetting
        : _providedOverrideReduceMotion === ReduceMotion.Always;
    }, [userReduceMotionSetting, _providedOverrideReduceMotion]);
    //#endregion

    //#region state/dynamic variables
    // states
    const animatedAnimationState = useSharedValue(ANIMATION_STATE.UNDETERMINED);
    const animatedAnimationSource = useSharedValue<ANIMATION_SOURCE>(
      ANIMATION_SOURCE.MOUNT
    );
    const animatedSheetState = useDerivedValue(() => {
      // closed position = position >= container height
      if (animatedPosition.get() >= animatedClosedPosition.get()) {
        return SHEET_STATE.CLOSED;
      }

      // extended position = container height - sheet height
      const extendedPosition =
        animatedContainerHeight.get() - animatedSheetHeight.get();
      if (animatedPosition.get() === extendedPosition) {
        return SHEET_STATE.EXTENDED;
      }

      // extended position with keyboard =
      // container height - (sheet height + keyboard height in root container)
      const keyboardHeightInContainer = animatedKeyboardHeightInContainer.get();
      const extendedPositionWithKeyboard = Math.max(
        0,
        animatedContainerHeight.get() -
        (animatedSheetHeight.get() + keyboardHeightInContainer)
      );

      // detect if keyboard is open and the sheet is in temporary position
      if (
        keyboardBehavior === KEYBOARD_BEHAVIOR.interactive &&
        isInTemporaryPosition.get() &&
        animatedPosition.get() === extendedPositionWithKeyboard
      ) {
        return SHEET_STATE.EXTENDED;
      }

      // fill parent = 0
      if (animatedPosition.get() === 0) {
        return SHEET_STATE.FILL_PARENT;
      }

      // detect if position is below extended point
      if (animatedPosition.get() < extendedPosition) {
        return SHEET_STATE.OVER_EXTENDED;
      }

      return SHEET_STATE.OPENED;
    }, [
      animatedClosedPosition,
      animatedContainerHeight,
      animatedKeyboardHeightInContainer,
      animatedPosition,
      animatedSheetHeight,
      isInTemporaryPosition,
      keyboardBehavior,
    ]);
    const animatedScrollableState = useDerivedValue<SCROLLABLE_STATE>(() => {
      /**
       * if user had disabled content panning gesture, then we unlock
       * the scrollable state.
       */
      if (!enableContentPanningGesture) {
        return SCROLLABLE_STATE.UNLOCKED;
      }

      /**
       * if scrollable override state is set, then we just return its value.
       */
      if (
        animatedScrollableOverrideState.get() !== SCROLLABLE_STATE.UNDETERMINED
      ) {
        return animatedScrollableOverrideState.get();
      }
      /**
       * if sheet state is fill parent, then unlock scrolling
       */
      if (animatedSheetState.get() === SHEET_STATE.FILL_PARENT) {
        return SCROLLABLE_STATE.UNLOCKED;
      }

      /**
       * if sheet state is extended, then unlock scrolling
       */
      if (animatedSheetState.get() === SHEET_STATE.EXTENDED) {
        return SCROLLABLE_STATE.UNLOCKED;
      }

      /**
       * if keyboard is shown and sheet is animating
       * then we do not lock the scrolling to not lose
       * current scrollable scroll position.
       */
      if (
        animatedKeyboardState.get() === KEYBOARD_STATE.SHOWN &&
        animatedAnimationState.get() === ANIMATION_STATE.RUNNING
      ) {
        return SCROLLABLE_STATE.UNLOCKED;
      }

      return SCROLLABLE_STATE.LOCKED;
    }, [
      enableContentPanningGesture,
      animatedAnimationState,
      animatedKeyboardState,
      animatedScrollableOverrideState,
      animatedSheetState,
    ]);
    // dynamic
    const animatedIndex = useDerivedValue(() => {
      const adjustedSnapPoints = animatedSnapPoints.get().slice().reverse();
      const adjustedSnapPointsIndexes = animatedSnapPoints.get()
        .slice()
        .map((_, index: number) => index)
        .reverse();

      /**
       * we add the close state index `-1`
       */
      adjustedSnapPoints.push(animatedContainerHeight.get());
      adjustedSnapPointsIndexes.push(-1);

      const currentIndex = isLayoutCalculated.get()
        ? interpolate(
          animatedPosition.get(),
          adjustedSnapPoints,
          adjustedSnapPointsIndexes,
          Extrapolation.CLAMP
        )
        : -1;

      /**
       * if the sheet is currently running an animation by the keyboard opening,
       * then we clamp the index on android with resize keyboard mode.
       */
      if (
        android_keyboardInputMode === KEYBOARD_INPUT_MODE.adjustResize &&
        animatedAnimationSource.get() === ANIMATION_SOURCE.KEYBOARD &&
        animatedAnimationState.get() === ANIMATION_STATE.RUNNING &&
        isInTemporaryPosition.get()
      ) {
        return Math.max(animatedCurrentIndex.get(), currentIndex);
      }

      /**
       * if the sheet is currently running an animation by snap point change - usually caused
       * by dynamic content height -, then we return the next position index.
       */
      if (
        animatedAnimationSource.get() === ANIMATION_SOURCE.SNAP_POINT_CHANGE &&
        animatedAnimationState.get() === ANIMATION_STATE.RUNNING
      ) {
        return animatedNextPositionIndex.get();
      }

      return currentIndex;
    }, [
      android_keyboardInputMode,
      animatedAnimationSource,
      animatedAnimationState,
      animatedContainerHeight,
      animatedCurrentIndex,
      animatedNextPositionIndex,
      animatedPosition,
      animatedSnapPoints,
      isInTemporaryPosition,
      isLayoutCalculated,
    ]);
    //#endregion

    //#region private methods
    // biome-ignore lint/correctness/useExhaustiveDependencies(BottomSheet.name): used for debug only
    const handleOnChange = useCallback(
      function handleOnChange(index: number, position: number) {
        if (__DEV__) {
          print({
            component: BottomSheet.name,
            method: handleOnChange.name,
            category: 'callback',
            params: {
              index,
              animatedCurrentIndex: animatedCurrentIndex.get(),
            },
          });
        }

        if (!_providedOnChange) {
          return;
        }

        _providedOnChange(
          index,
          position,
          index === animatedDynamicSnapPointIndex.get()
            ? SNAP_POINT_TYPE.DYNAMIC
            : SNAP_POINT_TYPE.PROVIDED
        );
      },
      [_providedOnChange, animatedCurrentIndex, animatedDynamicSnapPointIndex]
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies(BottomSheet.name): used for debug only
    const handleOnAnimate = useCallback(
      function handleOnAnimate(targetIndex: number, targetPosition: number) {
        if (__DEV__) {
          print({
            component: BottomSheet.name,
            method: handleOnAnimate.name,
            category: 'callback',
            params: {
              toIndex: targetIndex,
              toPosition: targetPosition,
              fromIndex: animatedCurrentIndex.get(),
              fromPosition: animatedPosition.get(),
            },
          });
        }

        if (!_providedOnAnimate) {
          return;
        }

        if (targetIndex !== animatedCurrentIndex.get()) {
          _providedOnAnimate(
            animatedCurrentIndex.get(),
            targetIndex,
            animatedPosition.get(),
            targetPosition
          );
        }
      },
      [_providedOnAnimate, animatedCurrentIndex, animatedPosition]
    );
    //#endregion

    //#region animation
    const stopAnimation = useWorkletCallback(() => {
      'worklet';
      cancelAnimation(animatedPosition);
      animatedAnimationSource.set(ANIMATION_SOURCE.NONE);
      animatedAnimationState.set(ANIMATION_STATE.STOPPED);
    }, [animatedPosition, animatedAnimationState, animatedAnimationSource]);
    const animateToPositionCompleted = useWorkletCallback(
      function animateToPositionCompleted(isFinished?: boolean) {
        'worklet';
        if (!isFinished) {
          return;
        }

        if (animatedAnimationSource.get() === ANIMATION_SOURCE.MOUNT) {
          isAnimatedOnMount.set(true);
        }

        // reset values
        isForcedClosing.set(false);
        animatedAnimationSource.set(ANIMATION_SOURCE.NONE);
        animatedAnimationState.set(ANIMATION_STATE.STOPPED);
        animatedNextPosition.set(INITIAL_VALUE);
        animatedNextPositionIndex.set(INITIAL_VALUE);
        animatedContainerHeightDidChange.set(false);
      }, []
    );
    const animateToPosition: AnimateToPositionType = useWorkletCallback(
      function animateToPosition(
        position: number,
        source: ANIMATION_SOURCE,
        velocity = 0,
        configs?: WithTimingConfig | WithSpringConfig
      ) {
        'worklet';


        if (
          position === animatedPosition.get() ||
          position === undefined ||
          (animatedAnimationState.get() === ANIMATION_STATE.RUNNING &&
            position === animatedNextPosition.get())
        ) {
          return;
        }

        // stop animation if it is running
        if (animatedAnimationState.get() === ANIMATION_STATE.RUNNING) {
          stopAnimation();
        }

        /**
         * set animation state to running, and source
         */
        animatedAnimationState.set(ANIMATION_STATE.RUNNING);
        animatedAnimationSource.set(source);

        /**
         * store next position
         */
        animatedNextPosition.set(position);

        /**
         * offset the position if keyboard is shown,
         * and behavior not extend.
         */
        let offset = 0;
        if (
          animatedKeyboardState.get() === KEYBOARD_STATE.SHOWN &&
          keyboardBehavior !== KEYBOARD_BEHAVIOR.extend &&
          position < animatedPosition.get()
        ) {
          offset = animatedKeyboardHeightInContainer.get();
        }

        animatedNextPositionIndex.set(animatedSnapPoints.get().indexOf(
          position + offset
        ));

        /**
         * fire `onAnimate` callback
         */
        runOnJS(handleOnAnimate)(animatedNextPositionIndex.get(), position);


        /**
         * start animation
         */
        animatedPosition.set(animate({
          point: position,
          configs: configs || _providedAnimationConfigs,
          velocity,
          overrideReduceMotion: _providedOverrideReduceMotion,
          onComplete: animateToPositionCompleted,
        }));
      },
      [
        handleOnAnimate,
        keyboardBehavior,
        _providedAnimationConfigs,
        _providedOverrideReduceMotion,
      ]
    );
    /**
     * Set to position without animation.
     *
     * @param targetPosition position to be set.
     */
    const setToPosition = useWorkletCallback(function setToPosition(
      targetPosition: number
    ) {
      'worklet';
      if (
        targetPosition === animatedPosition.get() ||
        targetPosition === undefined ||
        (animatedAnimationState.get() === ANIMATION_STATE.RUNNING &&
          targetPosition === animatedNextPosition.get())
      ) {
        return;
      }


      /**
       * store next position
       */
      animatedNextPosition.set(targetPosition);
      animatedNextPositionIndex.set(
        animatedSnapPoints.get().indexOf(targetPosition));

      stopAnimation();

      // set values
      animatedPosition.set(targetPosition);
      animatedContainerHeightDidChange.set(false);
    }, []);
    //#endregion

    //#region private methods
    /**
     * Calculate and evaluate the current position based on multiple
     * local states.
     */
    const getEvaluatedPosition = useWorkletCallback(
      function getEvaluatedPosition(source: ANIMATION_SOURCE) {
        'worklet';
        const currentIndex = animatedCurrentIndex.get();
        const snapPoints = animatedSnapPoints.get();
        const keyboardState = animatedKeyboardState.get();
        const highestSnapPoint = animatedHighestSnapPoint.get();

        /**
         * if the keyboard blur behavior is restore and keyboard is hidden,
         * then we return the previous snap point.
         */
        if (
          source === ANIMATION_SOURCE.KEYBOARD &&
          keyboardBlurBehavior === KEYBOARD_BLUR_BEHAVIOR.restore &&
          keyboardState === KEYBOARD_STATE.HIDDEN &&
          animatedContentGestureState.get() !== State.ACTIVE &&
          animatedHandleGestureState.get() !== State.ACTIVE
        ) {
          isInTemporaryPosition.set(false);
          const nextPosition = snapPoints[currentIndex];
          return nextPosition;
        }

        /**
         * if the keyboard appearance behavior is extend and keyboard is shown,
         * then we return the heights snap point.
         */
        if (
          keyboardBehavior === KEYBOARD_BEHAVIOR.extend &&
          keyboardState === KEYBOARD_STATE.SHOWN
        ) {
          return highestSnapPoint;
        }

        /**
         * if the keyboard appearance behavior is fill parent and keyboard is shown,
         * then we return 0 ( full screen ).
         */
        if (
          keyboardBehavior === KEYBOARD_BEHAVIOR.fillParent &&
          keyboardState === KEYBOARD_STATE.SHOWN
        ) {
          isInTemporaryPosition.set(true);
          return 0;
        }

        /**
         * if the keyboard appearance behavior is interactive and keyboard is shown,
         * then we return the heights points minus the keyboard in container height.
         */
        if (
          keyboardBehavior === KEYBOARD_BEHAVIOR.interactive &&
          keyboardState === KEYBOARD_STATE.SHOWN &&
          // ensure that this logic does not run on android
          // with resize input mode
          !(
            Platform.OS === 'android' &&
            android_keyboardInputMode === 'adjustResize'
          )
        ) {
          isInTemporaryPosition.set(true);
          const keyboardHeightInContainer =
            animatedKeyboardHeightInContainer.get();
          return Math.max(0, highestSnapPoint - keyboardHeightInContainer);
        }

        /**
         * if the bottom sheet is in temporary position, then we return
         * the current position.
         */
        if (isInTemporaryPosition.get()) {
          return animatedPosition.get();
        }

        /**
         * if the bottom sheet did not animate on mount,
         * then we return the provided index or the closed position.
         */
        if (!isAnimatedOnMount.get()) {
          return _providedIndex === -1
            ? animatedClosedPosition.get()
            : snapPoints[_providedIndex];
        }

        /**
         * return the current index position.
         */
        return snapPoints[currentIndex];
      },
      [
        animatedContentGestureState,
        animatedCurrentIndex,
        animatedHandleGestureState,
        animatedHighestSnapPoint,
        animatedKeyboardHeightInContainer,
        animatedKeyboardState,
        animatedPosition,
        animatedSnapPoints,
        isInTemporaryPosition,
        isAnimatedOnMount,
        keyboardBehavior,
        keyboardBlurBehavior,
        _providedIndex,
      ]
    );

    /**
     * Evaluate the bottom sheet position based based on a event source and other local states.
     */
    const evaluatePosition = useWorkletCallback(
      function evaluatePosition(
        source: ANIMATION_SOURCE,
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        'worklet';
        /**
         * if a force closing is running and source not from user, then we early exit
         */
        if (isForcedClosing.get() && source !== ANIMATION_SOURCE.USER) {
          return;
        }
        /**
         * when evaluating the position while layout is not calculated, then we early exit till it is.
         */
        if (!isLayoutCalculated.get()) {
          return;
        }

        const proposedPosition = getEvaluatedPosition(source);

        /**
         * when evaluating the position while the mount animation not been handled,
         * then we evaluate on mount use cases.
         */
        if (!isAnimatedOnMount.get()) {
          /**
           * if animate on mount is set to true, then we animate to the propose position,
           * else, we set the position with out animation.
           */
          if (animateOnMount) {
            animateToPosition(
              proposedPosition,
              ANIMATION_SOURCE.MOUNT,
              undefined,
              animationConfigs
            );
          } else {
            setToPosition(proposedPosition);
            isAnimatedOnMount.set(true);
          }
          return;
        }

        /**
         * when evaluating the position while the bottom sheet is animating.
         */
        if (animatedAnimationState.get() === ANIMATION_STATE.RUNNING) {
          /**
           * when evaluating the position while the bottom sheet is
           * closing, then we force closing the bottom sheet with no animation.
           */
          if (
            animatedNextPositionIndex.get() === -1 &&
            !isInTemporaryPosition.get()
          ) {
            setToPosition(animatedClosedPosition.get());
            return;
          }

          /**
           * when evaluating the position while it's animating to
           * a position other than the current position, then we
           * restart the animation.
           */
          if (animatedNextPositionIndex.get() !== animatedCurrentIndex.get()) {
            animateToPosition(
              animatedSnapPoints.get()[animatedNextPositionIndex.get()],
              source,
              undefined,
              animationConfigs
            );
            return;
          }
        }

        /**
         * when evaluating the position while the bottom sheet is in closed
         * position and not animating, we re-set the position to closed position.
         */
        if (
          animatedAnimationState.get() !== ANIMATION_STATE.RUNNING &&
          animatedCurrentIndex.get() === -1
        ) {
          /**
           * early exit if reduce motion is enabled and index is out of sync with position.
           */
          if (
            reduceMotion &&
            animatedSnapPoints.get()[animatedIndex.get()] !==
            animatedPosition.get()
          ) {
            return;
          }
          setToPosition(animatedClosedPosition.get());
          return;
        }

        /**
         * when evaluating the position after the container resize, then we
         * force the bottom sheet to the proposed position with no
         * animation.
         */
        if (animatedContainerHeightDidChange.get()) {
          setToPosition(proposedPosition);
          return;
        }

        /**
         * we fall back to the proposed position.
         */
        animateToPosition(
          proposedPosition,
          source,
          undefined,
          animationConfigs
        );
      },
      [getEvaluatedPosition, animateToPosition, setToPosition, reduceMotion]
    );
    //#endregion

    //#region public methods
    const handleSnapToIndex = useStableCallback(function handleSnapToIndex(
      index: number,
      animationConfigs?: WithSpringConfig | WithTimingConfig
    ) {
      const snapPoints = animatedSnapPoints.get();
      const isLayoutReady = isLayoutCalculated.get();

      // early exit if layout is not ready yet.
      if (!isLayoutReady) {
        return;
      }

      invariant(
        index >= -1 && index <= snapPoints.length - 1,
        `'index' was provided but out of the provided snap points range! expected value to be between -1, ${
          snapPoints.length - 1
        }`
      );
      if (__DEV__) {
        print({
          component: BottomSheet.name,
          method: handleSnapToIndex.name,
          params: {
            index,
          },
        });
      }

      const nextPosition = snapPoints[index];

      /**
       * exit method if :
       * - layout is not calculated.
       * - already animating to next position.
       * - sheet is forced closing.
       */
      if (
        !isLayoutCalculated.get() ||
        index === animatedNextPositionIndex.get() ||
        nextPosition === animatedNextPosition.get() ||
        isForcedClosing.get()
      ) {
        return;
      }

      /**
       * reset temporary position boolean.
       */
      isInTemporaryPosition.set(false);
      scheduleOnUI(animateToPosition, nextPosition, ANIMATION_SOURCE.USER, 0, animationConfigs);
    });
    const handleSnapToPosition = useWorkletCallback(
      function handleSnapToPosition(
        position: number | string,
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        'worklet';
        if (__DEV__) {
          print({
            component: BottomSheet.name,
            method: handleSnapToPosition.name,
            params: {
              position,
            },
          });
        }

        /**
         * normalized provided position.
         */
        const nextPosition = normalizeSnapPoint(
          position,
          animatedContainerHeight.get()
        );

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated ||
          nextPosition === animatedNextPosition.get() ||
          isForcedClosing.get()
        ) {
          return;
        }

        /**
         * mark the new position as temporary.
         */
        isInTemporaryPosition.set(true);
        scheduleOnUI(animateToPosition, nextPosition, ANIMATION_SOURCE.USER, 0, animationConfigs);
      },
      [
        animateToPosition,
        bottomInset,
        topInset,
        isLayoutCalculated,
        isForcedClosing,
        animatedContainerHeight,
        animatedPosition,
      ]
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies(BottomSheet.name): used for debug only
    const handleClose = useCallback(
      function handleClose(
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        if (__DEV__) {
          print({
            component: BottomSheet.name,
            method: handleClose.name,
          });
        }

        const nextPosition = animatedClosedPosition.get();

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated.get() ||
          nextPosition === animatedNextPosition.get() ||
          isForcedClosing.get()
        ) {
          return;
        }

        /**
         * reset temporary position variable.
         */
        isInTemporaryPosition.set(false);
        scheduleOnUI(animateToPosition, nextPosition, ANIMATION_SOURCE.USER, 0, animationConfigs);
      },
      [
        animateToPosition,
        isForcedClosing,
        isLayoutCalculated,
        isInTemporaryPosition,
        animatedNextPosition,
        animatedClosedPosition,
      ]
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies(BottomSheet.name): used for debug only
    const handleForceClose = useCallback(
      function handleForceClose(
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        if (__DEV__) {
          print({
            component: BottomSheet.name,
            method: handleForceClose.name,
          });
        }

        const nextPosition = animatedClosedPosition.get();

        /**
         * exit method if :
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          nextPosition === animatedNextPosition.get() ||
          isForcedClosing.get()
        ) {
          return;
        }

        /**
         * reset temporary position variable.
         */
        isInTemporaryPosition.set(false);

        /**
         * set force closing variable.
         */
        isForcedClosing.set(true);

        scheduleOnUI(animateToPosition, nextPosition, ANIMATION_SOURCE.USER, 0, animationConfigs);
      },
      [
        animateToPosition,
        isForcedClosing,
        isInTemporaryPosition,
        animatedNextPosition,
        animatedClosedPosition,
      ]
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies(BottomSheet.name): used for debug only
    const handleExpand = useCallback(
      function handleExpand(animationConfigs?: WithSpringConfig | WithTimingConfig) {

        const snapPoints = animatedSnapPoints.get();

        // Если снэп-поинты не нормализованы, пробуем восстановиться
        if (snapPoints.length === 0 || snapPoints[0] === INITIAL_SNAP_POINT) {
          // Используем фолбэк снэп-поинты на основе высоты экрана
          const screenHeight = Dimensions.get('window').height;
          const fallbackSnapPoints = [screenHeight * 0.5, screenHeight * 0.9];
          const nextPosition = fallbackSnapPoints[fallbackSnapPoints.length - 1];

          scheduleOnUI(animateToPosition, nextPosition, ANIMATION_SOURCE.USER, 0, animationConfigs);
          return;
        }

        const nextPosition = snapPoints[snapPoints.length - 1];

        // Смягчаем условия выхода
        if (
          // Убираем проверку isLayoutCalculated
          snapPoints.length - 1 === animatedNextPositionIndex.get() ||
          nextPosition === animatedNextPosition.get() ||
          isForcedClosing.get()
        ) {
          return;
        }

        isInTemporaryPosition.set(false);

// Прямая установка позиции (для теста)
        animatedPosition.set(nextPosition);
        // scheduleOnUI(animateToPosition, nextPosition, ANIMATION_SOURCE.USER, 0, animationConfigs);
      },
      [
        animateToPosition,
        isInTemporaryPosition,
        isForcedClosing,
        animatedSnapPoints,
        animatedNextPosition,
        animatedNextPositionIndex,
      ]
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies(BottomSheet.name): used for debug only
    const handleCollapse = useCallback(
      function handleCollapse(
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        if (__DEV__) {
          print({
            component: BottomSheet.name,
            method: handleCollapse.name,
          });
        }

        const nextPosition = animatedSnapPoints.get()[0];

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated ||
          animatedNextPositionIndex.get() === 0 ||
          nextPosition === animatedNextPosition.get() ||
          isForcedClosing.get()
        ) {
          return;
        }

        /**
         * reset temporary position boolean.
         */
        isInTemporaryPosition.set(false);
        scheduleOnUI(animateToPosition, nextPosition, ANIMATION_SOURCE.USER, 0, animationConfigs);

      },
      [
        animateToPosition,
        isForcedClosing,
        isLayoutCalculated,
        isInTemporaryPosition,
        animatedSnapPoints,
        animatedNextPosition,
        animatedNextPositionIndex,
      ]
    );

    useImperativeHandle(ref, () => ({
      snapToIndex: handleSnapToIndex,
      snapToPosition: handleSnapToPosition,
      expand: handleExpand,
      collapse: handleCollapse,
      close: handleClose,
      forceClose: handleForceClose,
    }));


    useEffect(() => {
      const initializeLayout = async () => {
        // Даем время на естественное измерение
        await new Promise(resolve => setTimeout(resolve, 300));

        // Проверяем и принудительно устанавливаем высоту контейнера
        if (animatedContainerHeight.get() === INITIAL_CONTAINER_HEIGHT) {
          const screenHeight = Dimensions.get('window').height;
          _animatedContainerHeight.set(screenHeight);
        }

        // Проверяем высоту хендлера
        if (animatedHandleHeight.get() === INITIAL_HANDLE_HEIGHT) {
          if (handleComponent === null) {
            animatedHandleHeight.set(0);
          } else {
            animatedHandleHeight.set(24); // Стандартная высота
          }
        }

        // Принудительно нормализуем снэп-поинты, вызвав пересчет
        scheduleOnUI(() => {
          'worklet';
          // Форсируем пересчет снэп-поинтов
          animatedSnapPoints.set(animatedSnapPoints.get()); // триггерим обновление
        });

        // Еще небольшая задержка
        setTimeout(() => {
          // Если всё ещё не готово, пробуем открыть принудительно
          if (!isLayoutCalculated.get()) {
            handleExpand();
          }
        }, 500);
      };

      initializeLayout();
    }, [handleComponent]); // Зависимость от handleComponent

    //#endregion

    //#region contexts variables
    const internalContextVariables = useMemo(
      () => ({
        enableContentPanningGesture,
        enableDynamicSizing,
        overDragResistanceFactor,
        enableOverDrag,
        enablePanDownToClose,
        animatedAnimationState,
        animatedSheetState,
        animatedScrollableState,
        animatedScrollableOverrideState,
        animatedContentGestureState,
        animatedHandleGestureState,
        animatedKeyboardState,
        animatedScrollableType,
        animatedIndex,
        animatedPosition,
        animatedSheetHeight,
        animatedContentHeight,
        animatedClosedPosition,
        animatedHandleHeight,
        animatedFooterHeight,
        animatedKeyboardHeight,
        animatedKeyboardHeightInContainer,
        animatedContainerHeight,
        animatedSnapPoints,
        animatedHighestSnapPoint,
        animatedScrollableContentOffsetY,
        isInTemporaryPosition,
        isContentHeightFixed,
        isScrollableRefreshable,
        shouldHandleKeyboardEvents,
        simultaneousHandlers: _providedSimultaneousHandlers,
        waitFor: _providedWaitFor,
        activeOffsetX: _providedActiveOffsetX,
        activeOffsetY: _providedActiveOffsetY,
        failOffsetX: _providedFailOffsetX,
        failOffsetY: _providedFailOffsetY,
        enableBlurKeyboardOnGesture,
        animateToPosition,
        stopAnimation,
        setScrollableRef,
        removeScrollableRef,
      }),
      [
        animatedIndex,
        animatedPosition,
        animatedContentHeight,
        animatedSheetHeight,
        animatedScrollableType,
        animatedContentGestureState,
        animatedHandleGestureState,
        animatedClosedPosition,
        animatedFooterHeight,
        animatedContainerHeight,
        animatedHandleHeight,
        animatedAnimationState,
        animatedKeyboardState,
        animatedKeyboardHeight,
        animatedKeyboardHeightInContainer,
        animatedSheetState,
        animatedHighestSnapPoint,
        animatedScrollableState,
        animatedScrollableOverrideState,
        animatedSnapPoints,
        shouldHandleKeyboardEvents,
        animatedScrollableContentOffsetY,
        isScrollableRefreshable,
        isContentHeightFixed,
        isInTemporaryPosition,
        enableContentPanningGesture,
        overDragResistanceFactor,
        enableOverDrag,
        enablePanDownToClose,
        enableDynamicSizing,
        enableBlurKeyboardOnGesture,
        _providedSimultaneousHandlers,
        _providedWaitFor,
        _providedActiveOffsetX,
        _providedActiveOffsetY,
        _providedFailOffsetX,
        _providedFailOffsetY,
        setScrollableRef,
        removeScrollableRef,
        animateToPosition,
        stopAnimation,
      ]
    );
    const externalContextVariables = useMemo(
      () => ({
        animatedIndex,
        animatedPosition,
        snapToIndex: handleSnapToIndex,
        snapToPosition: handleSnapToPosition,
        expand: handleExpand,
        collapse: handleCollapse,
        close: handleClose,
        forceClose: handleForceClose,
      }),
      [
        animatedIndex,
        animatedPosition,
        handleSnapToIndex,
        handleSnapToPosition,
        handleExpand,
        handleCollapse,
        handleClose,
        handleForceClose,
      ]
    );
    //#endregion

    //#region effects
    useAnimatedReaction(
      () => animatedContainerHeight.get(),
      (result, previous) => {
        if (result === INITIAL_CONTAINER_HEIGHT) {
          return;
        }

        animatedContainerHeightDidChange.set(result !== previous);

        /**
         * When user close the bottom sheet while the keyboard open on Android with
         * software keyboard layout mode set to resize, the close position would be
         * set to the container height - the keyboard height, and when the keyboard
         * closes, the container height and here we restart the animation again.
         *
         * [read more](https://github.com/gorhom/react-native-bottom-sheet/issues/2163)
         */
        if (
          animatedAnimationState.get() === ANIMATION_STATE.RUNNING &&
          animatedAnimationSource.get() === ANIMATION_SOURCE.GESTURE &&
          animatedNextPositionIndex.get() === -1
        ) {
          animateToPosition(
            animatedClosedPosition.get(),
            ANIMATION_SOURCE.GESTURE
          );
        }
      }
    );

    /**
     * Reaction to the `snapPoints` change, to insure that the sheet position reflect
     * to the current point correctly.
     *
     * @alias OnSnapPointsChange
     */
    useAnimatedReaction(
      () => animatedSnapPoints.get(),
      (result, previous) => {
        /**
         * if values did not change, and did handle on mount animation
         * then we early exit the method.
         */
        if (
          JSON.stringify(result) === JSON.stringify(previous) &&
          isAnimatedOnMount.get()
        ) {
          return;
        }

        /**
         * if layout is not calculated yet, then we exit the method.
         */
        if (!isLayoutCalculated.get()) {
          return;
        }


        evaluatePosition(ANIMATION_SOURCE.SNAP_POINT_CHANGE);
      },
      [isLayoutCalculated, animatedSnapPoints]
    );

    /**
     * Reaction to the keyboard state change.
     *
     * @alias OnKeyboardStateChange
     */
    useAnimatedReaction(
      () => ({
        _keyboardState: animatedKeyboardState.get(),
        _keyboardHeight: animatedKeyboardHeight.get(),
      }),
      (result, _previousResult) => {
        const {_keyboardState, _keyboardHeight} = result;
        const _previousKeyboardState = _previousResult?._keyboardState;
        const _previousKeyboardHeight = _previousResult?._keyboardHeight;

        /**
         * if keyboard state is equal to the previous state, then exit the method
         */
        if (
          _keyboardState === _previousKeyboardState &&
          _keyboardHeight === _previousKeyboardHeight
        ) {
          return;
        }

        /**
         * if state is undetermined, then we early exit.
         */
        if (_keyboardState === KEYBOARD_STATE.UNDETERMINED) {
          return;
        }

        /**
         * if keyboard is hidden by customer gesture, then we early exit.
         */
        if (
          _keyboardState === KEYBOARD_STATE.HIDDEN &&
          animatedAnimationState.get() === ANIMATION_STATE.RUNNING &&
          animatedAnimationSource.get() === ANIMATION_SOURCE.GESTURE
        ) {
          return;
        }


        /**
         * Calculate the keyboard height in the container.
         */
        animatedKeyboardHeightInContainer.set(
          _keyboardHeight === 0
            ? 0
            : $modal
              ? Math.abs(
                _keyboardHeight -
                Math.abs(bottomInset - animatedContainerOffset.get().bottom)
              )
              : Math.abs(
                _keyboardHeight - animatedContainerOffset.get().bottom
              ));

        /**
         * if platform is android and the input mode is resize, then exit the method
         */
        if (
          Platform.OS === 'android' &&
          android_keyboardInputMode === KEYBOARD_INPUT_MODE.adjustResize
        ) {
          animatedKeyboardHeightInContainer.set(0);

          if (keyboardBehavior === KEYBOARD_BEHAVIOR.interactive) {
            return;
          }
        }

        /**
         * if user is interacting with sheet, then exit the method
         */
        const hasActiveGesture =
          animatedContentGestureState.get() === State.ACTIVE ||
          animatedContentGestureState.get() === State.BEGAN ||
          animatedHandleGestureState.get() === State.ACTIVE ||
          animatedHandleGestureState.get() === State.BEGAN;
        if (hasActiveGesture) {
          return;
        }

        /**
         * if new keyboard state is hidden and blur behavior is none, then exit the method
         */
        if (
          _keyboardState === KEYBOARD_STATE.HIDDEN &&
          keyboardBlurBehavior === KEYBOARD_BLUR_BEHAVIOR.none
        ) {
          return;
        }

        const animationConfigs = getKeyboardAnimationConfigs(
          keyboardAnimationEasing.get(),
          keyboardAnimationDuration.get()
        );

        evaluatePosition(ANIMATION_SOURCE.KEYBOARD, animationConfigs);
      },
      [
        $modal,
        bottomInset,
        keyboardBehavior,
        keyboardBlurBehavior,
        android_keyboardInputMode,
        animatedContainerOffset,
        getEvaluatedPosition,
      ]
    );

    /**
     * sets provided animated position
     */
    useAnimatedReaction(
      () => animatedPosition.get(),
      _animatedPosition => {
        if (_providedAnimatedPosition) {
          _providedAnimatedPosition.set(_animatedPosition + topInset);
        }
      },
      []
    );

    /**
     * sets provided animated index
     */
    useAnimatedReaction(
      () => animatedIndex.get(),
      _animatedIndex => {
        if (_providedAnimatedIndex) {
          _providedAnimatedIndex.set(_animatedIndex);
        }
      },
      []
    );

    /**
     * React to internal variables to detect change in snap position.
     *
     * @alias OnChange
     */
    useAnimatedReaction(
      () => ({
        _animatedIndex: animatedIndex.get(),
        _animatedPosition: animatedPosition.get(),
        _animationState: animatedAnimationState.get(),
        _contentGestureState: animatedContentGestureState.get(),
        _handleGestureState: animatedHandleGestureState.get(),
      }),
      ({
         _animatedIndex,
         _animatedPosition,
         _animationState,
         _contentGestureState,
         _handleGestureState,
       }) => {
        /**
         * exit the method if animation state is not stopped.
         */
        if (_animationState !== ANIMATION_STATE.STOPPED) {
          return;
        }

        /**
         * exit the method if index value is not synced with
         * position value.
         *
         * [read more](https://github.com/gorhom/react-native-bottom-sheet/issues/1356)
         */
        if (
          animatedNextPosition.get() !== INITIAL_VALUE &&
          animatedNextPositionIndex.get() !== INITIAL_VALUE &&
          (_animatedPosition !== animatedNextPosition.get() ||
            _animatedIndex !== animatedNextPositionIndex.get())
        ) {
          return;
        }

        /**
         * exit the method if animated index value
         * has fraction, e.g. 1.99, 0.52
         */
        if (_animatedIndex % 1 !== 0) {
          return;
        }

        /**
         * exit the method if there any active gesture.
         */
        const hasNoActiveGesture =
          (_contentGestureState === State.END ||
            _contentGestureState === State.UNDETERMINED ||
            _contentGestureState === State.CANCELLED) &&
          (_handleGestureState === State.END ||
            _handleGestureState === State.UNDETERMINED ||
            _handleGestureState === State.CANCELLED);
        if (!hasNoActiveGesture) {
          return;
        }

        /**
         * exit the method if the animated index is out of sync with the
         * animated position. this happened when the user enable reduce
         * motion setting only.
         */
        if (
          reduceMotion &&
          _animatedIndex === animatedCurrentIndex.get() &&
          animatedSnapPoints.get()[_animatedIndex] !== _animatedPosition
        ) {
          return;
        }

        /**
         * if the index is not equal to the current index,
         * than the sheet position had changed and we trigger
         * the `onChange` callback.
         */
        if (_animatedIndex !== animatedCurrentIndex.get()) {


          animatedCurrentIndex.set(_animatedIndex);
          runOnJS(handleOnChange)(_animatedIndex, _animatedPosition);
        }

        /**
         * if index is `-1` than we fire the `onClose` callback.
         */
        if (_animatedIndex === -1 && _providedOnClose) {
          runOnJS(_providedOnClose)();
        }
      },
      [reduceMotion, handleOnChange, _providedOnClose]
    );

    /**
     * React to `index` prop to snap the sheet to the new position.
     *
     * @alias onIndexChange
     */
    useEffect(() => {
      // early exit, if animate on mount is set and it did not animate yet.
      if (animateOnMount && !isAnimatedOnMount.get()) {
        return;
      }

      handleSnapToIndex(_providedIndex);
    }, [animateOnMount, _providedIndex, isAnimatedOnMount, handleSnapToIndex]);


    //#endregion

    // render
    return (
      <BottomSheetProvider value={externalContextVariables}>
        <BottomSheetInternalProvider value={internalContextVariables}>
          <BottomSheetGestureHandlersProvider
            gestureEventsHandlersHook={gestureEventsHandlersHook}
          >
            {BackdropComponent ? (
              <BackdropComponent
                animatedIndex={animatedIndex}
                animatedPosition={animatedPosition}
                style={StyleSheet.absoluteFillObject}
              />
            ) : null}
            <BottomSheetHostingContainer
              key="BottomSheetContainer"
              shouldCalculateHeight={!$modal}
              containerHeight={_animatedContainerHeight}
              containerOffset={animatedContainerOffset}
              topInset={topInset}
              bottomInset={bottomInset}
              detached={detached}
              style={_providedContainerStyle}
            >
              <BottomSheetBody style={style}>
                {backgroundComponent === null ? null : (
                  <BottomSheetBackgroundContainer
                    key="BottomSheetBackgroundContainer"
                    animatedIndex={animatedIndex}
                    animatedPosition={animatedPosition}
                    backgroundComponent={backgroundComponent}
                    backgroundStyle={_providedBackgroundStyle}
                  />
                )}
                <BottomSheetContent
                  pointerEvents="box-none"
                  accessible={_providedAccessible ?? undefined}
                  accessibilityRole={_providedAccessibilityRole ?? undefined}
                  accessibilityLabel={_providedAccessibilityLabel ?? undefined}
                  keyboardBehavior={keyboardBehavior}
                  detached={detached}
                >
                  {children}
                  {footerComponent ? (
                    <BottomSheetFooterContainer
                      footerComponent={footerComponent}
                    />
                  ) : null}
                </BottomSheetContent>
                {handleComponent !== null ? (
                  <BottomSheetHandleContainer
                    key="BottomSheetHandleContainer"
                    animatedIndex={animatedIndex}
                    animatedPosition={animatedPosition}
                    handleHeight={animatedHandleHeight}
                    enableHandlePanningGesture={enableHandlePanningGesture}
                    enableOverDrag={enableOverDrag}
                    enablePanDownToClose={enablePanDownToClose}
                    overDragResistanceFactor={overDragResistanceFactor}
                    keyboardBehavior={keyboardBehavior}
                    handleComponent={handleComponent}
                    handleStyle={_providedHandleStyle}
                    handleIndicatorStyle={_providedHandleIndicatorStyle}
                  />
                ) : null}
              </BottomSheetBody>
              {/* <BottomSheetDebugView
                values={{
                  // topInset,
                  // bottomInset,
                  animatedSheetState,
                  // animatedScrollableState,
                  // animatedScrollableOverrideState,
                  // isScrollableRefreshable,
                  // animatedScrollableContentOffsetY,
                  // keyboardState,
                  animatedIndex,
                  animatedCurrentIndex,
                  animatedPosition,
                  // animatedHandleGestureState,
                  // animatedContentGestureState,
                  animatedContainerHeight,
                  animatedHighestSnapPoint,
                  animatedSheetHeight,
                  animatedHandleHeight,
                  animatedContentHeight,
                  animatedFooterHeight,
                  animatedKeyboardHeight,
                  animatedKeyboardHeightInContainer,
                  // // keyboardHeight,
                  // isLayoutCalculated,
                  // isContentHeightFixed,
                  // isInTemporaryPosition,
                }}
              /> */}
            </BottomSheetHostingContainer>
          </BottomSheetGestureHandlersProvider>
        </BottomSheetInternalProvider>
      </BottomSheetProvider>
    );
  }
);

const BottomSheet = memo(BottomSheetComponent);
BottomSheet.displayName = 'BottomSheet';

export default BottomSheet;
