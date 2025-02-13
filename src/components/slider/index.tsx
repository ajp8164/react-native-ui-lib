import {
  AccessibilityActionEvent,
  AccessibilityInfo,
  AccessibilityRole,
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  View as RNView,
  StyleProp,
  StyleSheet,
  ViewStyle
} from 'react-native';
import React, {PureComponent, ReactElement} from 'react';
import Thumb, {ThumbProps} from './Thumb';

import {Colors} from '../../style';
import {Constants} from '../../commons/new';
import View from '../view';
import _ from 'lodash';
import {extractAccessibilityProps} from '../../commons/modifiers';

const TRACK_SIZE = 6;
const THUMB_SIZE = 24;
const SHADOW_RADIUS = 4;
const DEFAULT_COLOR = Colors.$backgroundDisabled;
const ACTIVE_COLOR = Colors.$backgroundPrimaryHeavy;
const INACTIVE_COLOR = Colors.$backgroundNeutralMedium;

export type SliderOnValueChange = (value: number) => void;
export type SliderOnRangeChange = (values: {min: number, max: number}) => void;

export type SliderProps = Omit<ThumbProps, 'ref'> & {
  /**
   * Initial value
   */
  value?: number;
  /**
   * Initial minimum value (when using range slider)
   */
  initialMinimumValue?: number;
   /**
    * Initial maximum value (when using range slider)
    */
  initialMaximumValue?: number;
    /**
    * Track minimum value
    */
  minimumValue?: number;
   /**
    * Track maximum value
    */
  maximumValue?: number;
   /**
   * Step value of the slider. The value should be between 0 and (maximumValue - minimumValue)
   */
  step?: number;
  /**
   * The color used for the track from minimum value to current value
   */
  minimumTrackTintColor?: string;
  /**
   * The track color
   */
  maximumTrackTintColor?: string;
  /**
   * Custom render instead of rendering the track
   */
  renderTrack?: () => ReactElement | ReactElement[];
  /**
   * Callback for onValueChange
   */
  onValueChange?: SliderOnValueChange;
  /**
   * Callback that notifies about slider seeking is started
   */
  onSeekStart?: () => void;
  /**
   * Callback that notifies about slider seeking is finished
   */
  onSeekEnd?: () => void;
  /**
   * The container style
   */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * The track style
   */
  trackStyle?: StyleProp<ViewStyle>;
  /**
   * If true the Slider will be disabled and will appear in disabled color
   */
  disabled?: boolean;
  /**
   * If true the Slider will display a second thumb for the min value
   */
  useRange?: boolean;
   /**
   * Callback for onRangeChange. Returns values object with the min and max values
   */
  onRangeChange?: SliderOnRangeChange;
  /**
   * If true the Slider will stay in LTR mode even if the app is on RTL mode
   */
  disableRTL?: boolean;
  /**
   * If true the component will have accessibility features enabled
   */
  accessible?: boolean;
  /**
   * The slider's test identifier
   */
  testID?: string;
} & typeof defaultProps;

interface State {
  containerSize: Measurements;
  trackSize: Measurements;
  thumbSize: Measurements;
  thumbActiveAnimation: Animated.Value;
  measureCompleted: boolean;
}

type Measurements = {
  width: number;
  height: number;
};

type ThumbStyle = {style?: StyleProp<ViewStyle>; left?: StyleProp<number>};

type MinTrackStyle = {style?: StyleProp<ViewStyle>; width?: StyleProp<number>, left?: StyleProp<number>};

type MeasuredVariableName = 'containerSize' | 'trackSize' | 'thumbSize';

const defaultProps = {
  value: 0,
  initialMinimumValue: 0,
  initialMaximumValue: 1,
  minimumValue: 0,
  maximumValue: 1,
  step: 0,
  thumbHitSlop: {top: 10, bottom: 10, left: 24, right: 24}
};

/**
 * @description: A Slider component
 * @example: https://github.com/wix/react-native-ui-lib/blob/master/demo/src/screens/componentScreens/SliderScreen.tsx
 * @gif: https://github.com/wix/react-native-ui-lib/blob/master/demo/showcase/Slider/Slider.gif?raw=true
 */
export default class Slider extends PureComponent<SliderProps, State> {
  static displayName = 'Slider';

  static defaultProps = defaultProps;

  private thumb = React.createRef<RNView>();
  private minThumb = React.createRef<RNView>();
  private activeThumbRef: React.RefObject<RNView>;
  private panResponder;
  
  private minTrack = React.createRef<RNView>();
  private _minTrackStyles: MinTrackStyle = {};
  
  private _x = 0;
  private _x_min = 0;
  private lastDx = 0;

  private initialValue = this.getRoundedValue(this.props.useRange ? this.props.initialMaximumValue : this.props.value);
  private minInitialValue = this.getRoundedValue(this.props.initialMinimumValue);
  private lastValue = this.initialValue;
  private lastMinValue = this.minInitialValue;

  private _thumbStyles: ThumbStyle = {};
  private _minThumbStyles: ThumbStyle = {left: 0};

  private initialThumbSize: Measurements = {width: THUMB_SIZE, height: THUMB_SIZE};
  private containerSize: Measurements | undefined;
  private trackSize: Measurements | undefined;
  private thumbSize: Measurements | undefined;
  private dimensionsChangeListener: any;

  constructor(props: SliderProps) {
    super(props);

    this.activeThumbRef = this.thumb;

    this.state = {
      containerSize: {width: 0, height: 0},
      trackSize: {width: 0, height: 0},
      thumbSize: {width: 0, height: 0},
      thumbActiveAnimation: new Animated.Value(1),
      measureCompleted: false
    };

    this.checkProps(props);

    this.panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: this.handleMoveShouldSetPanResponder,
      onPanResponderGrant: this.handlePanResponderGrant,
      onPanResponderMove: this.handlePanResponderMove,
      onPanResponderRelease: this.handlePanResponderEnd,
      onStartShouldSetPanResponder: () => true,
      onPanResponderEnd: () => true,
      onPanResponderTerminationRequest: () => false
    });
  }

  checkProps(props: SliderProps) {
    if (props.minimumValue >= props.maximumValue) {
      console.warn('Slider minimumValue must be lower than maximumValue');
    }
    if (props.value < props.minimumValue || props.value > props.maximumValue) {
      console.warn('Slider value is not in range');
    }
  }

  getAccessibilityProps() {
    const {disabled} = this.props;

    return {
      accessibilityLabel: 'Slider',
      accessible: true,
      accessibilityRole: 'adjustable' as AccessibilityRole,
      accessibilityStates: disabled ? ['disabled'] : [],
      accessibilityActions: [
        {name: 'increment', label: 'increment'},
        {name: 'decrement', label: 'decrement'}
      ],
      ...extractAccessibilityProps(this.props)
    };
  }

  componentDidUpdate(prevProps: SliderProps, prevState: State) {
    if (!this.props.useRange && prevProps.value !== this.props.value) {
      this.initialValue = this.getRoundedValue(this.props.value);
      
      // set position for new value
      this._x = this.getXForValue(this.initialValue);
      this.moveTo(this._x);
    }

    if (prevState.measureCompleted !== this.state.measureCompleted) {
      this.initialThumbSize = this.state.thumbSize; // for thumb enlargement
      
      // set initial position
      this._x = this.getXForValue(this.initialValue);
      this._x_min = this.getXForValue(this.minInitialValue);
      this.moveTo(this._x);
    }
  }

  componentDidMount() {
    this.dimensionsChangeListener = Constants.addDimensionsEventListener(this.onOrientationChanged);
  }

  componentWillUnmount() {
    Constants.removeDimensionsEventListener(this.dimensionsChangeListener || this.onOrientationChanged);
  }

  /* Gesture Recognizer */

  handleMoveShouldSetPanResponder = () => {
    return true;
  };

  handlePanResponderGrant = () => {
    this.lastDx = 0;
    this.onSeekStart();
  };

  handlePanResponderMove = (_e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
    const {disabled} = this.props;
    if (disabled) {
      return;
    }
    // dx = accumulated distance since touch start
    const dx = gestureState.dx * (Constants.isRTL && !this.disableRTL ? -1 : 1);
    this.update(dx - this.lastDx);
    this.lastDx = dx;
  };

  handlePanResponderEnd = () => {
    this.bounceToStep();
    this.onSeekEnd();
  };

  /* Actions */

  setActiveThumb = (ref: React.RefObject<RNView>) => {
    this.activeThumbRef = ref;
  }

  get_x() {
    if (this.isDefaultThumbActive()) {
      return this._x;
    } else {
      return this._x_min;
    }
  }

  set_x(x: number) {
    if (this.isDefaultThumbActive()) {
      this._x = x;
    } else {
      this._x_min = x;
    }
  }
  reset() {
    this.lastValue = this.initialValue;
    this.lastMinValue = this.minInitialValue;
    this.lastDx = 0;

    this.setActiveThumb(this.thumb);
    this.set_x(this.getXForValue(this.initialValue));
    this.update(0);

    this.setActiveThumb(this.minThumb);
    this.set_x(this.getXForValue(this.minInitialValue));
    this.update(0);
  }

  update(dx: number) {
    // calc x in range (instead of: this._x += dx)
    let x = this.get_x();
    x += dx;
    x = Math.max(Math.min(x, this.state.trackSize.width), 0);

    this.set_x(x);
    this.moveTo(x);
    if (!this.props.useRange) {
      this.updateValue(x);
    }
  }

  bounceToStep() {
    if (this.props.step > 0) {
      const value = this.getValueForX(this.get_x());
      const roundedValue = this.getRoundedValue(value);
      const x = this.getXForValue(roundedValue);

      this.set_x(x);
      this.moveTo(x);
    }
  }

  updateValue(x: number) {
    const value = this.getValueForX(x);

    if (this.props.useRange) {
      this.onRangeChange(value);
    } else {
      this.onValueChange(value);
    }
  }

  moveTo(x: number) {
    if (this.isDefaultThumbActive()) {
      if (this.thumb.current) {
        const {useRange} = this.props;
        const {trackSize} = this.state;
        const nonOverlappingTrackWidth = trackSize.width - this.initialThumbSize.width;
        const _x = this.shouldForceLTR ? trackSize.width - x : x; // adjust for RTL
        const left = trackSize.width === 0 ? _x : (_x * nonOverlappingTrackWidth) / trackSize.width; // do not render above prefix\suffix icon\text
        
        if (useRange) {
          const minThumbPosition = this._minThumbStyles?.left as number;
          if (left >= minThumbPosition) {
            this._thumbStyles.left = left;
            
            const width = left - minThumbPosition;
            this._minTrackStyles.width = width;
            
            this.updateValue(x);
          }
        } else {
          this._thumbStyles.left = left;
          this._minTrackStyles.width = Math.min(trackSize.width, x);
        }
        
        this.thumb.current?.setNativeProps(this._thumbStyles);
        this.minTrack.current?.setNativeProps(this._minTrackStyles);
      }
    } else {
      this.moveMinTo(x);
    }
  }

  moveMinTo(x: number) {
    const {trackSize} = this.state;

    if (this.minThumb.current) {
      const nonOverlappingTrackWidth = trackSize.width - this.initialThumbSize.width;
      const _x = this.shouldForceLTR ? nonOverlappingTrackWidth - x : x; // adjust for RTL
      const left = trackSize.width === 0 ? _x : (_x * nonOverlappingTrackWidth) / trackSize.width; // do not render above prefix\suffix icon\text
      
      const maxThumbPosition = this._thumbStyles?.left as number;
      if (left <= maxThumbPosition) {
        this._minThumbStyles.left = left;
        
        this._minTrackStyles.width = maxThumbPosition - x;
        this._minTrackStyles.left = x;
        
        this.minThumb.current?.setNativeProps(this._minThumbStyles);
        this.minTrack.current?.setNativeProps(this._minTrackStyles);

        this.updateValue(x);
      }
    }
  }

  updateTrackStepAndStyle = ({nativeEvent}: GestureResponderEvent) => {
    const {step, useRange} = this.props;
    const {trackSize} = this.state;

    const newX = Constants.isRTL && !this.disableRTL ? trackSize.width - nativeEvent.locationX : nativeEvent.locationX;

    if (useRange) {
      if (this.isDefaultThumbActive() && this._minThumbStyles?.left && newX < this._minThumbStyles?.left) {
        // new x is smaller then min but the active thumb is the max
        this.setActiveThumb(this.minThumb);
      } else if (!this.isDefaultThumbActive() && this._thumbStyles.left && newX > this._thumbStyles.left) {
        // new x is bigger then max but the active thumb is the min
        this.setActiveThumb(this.thumb);
      }
    }
      
    this.set_x(newX);
    
    if (!useRange) {
      this.updateValue(this.get_x());
    }

    if (step > 0) {
      this.bounceToStep();
    } else {
      this.moveTo(this.get_x());
    }
  };

  /** Values */

  get disableRTL() {
    const {disableRTL, useRange} = this.props;
    if (useRange) { // block forceRTL on range slider
      return false;
    }
    return disableRTL;
  }

  shouldForceLTR = Constants.isRTL && this.disableRTL;

  isDefaultThumbActive = () => {
    return this.activeThumbRef === this.thumb;
  }

  getRoundedValue(value: number) {
    const {step} = this.props;
    const v = this.getValueInRange(value);
    return step > 0 ? Math.round(v / step) * step : v;
  }

  getValueInRange(value: number) {
    const {minimumValue, maximumValue} = this.props;
    const v = value < minimumValue ? minimumValue : value > maximumValue ? maximumValue : value;
    return v;
  }

  getXForValue(value: number) {
    const {minimumValue} = this.props;
    const range = this.getRange();
    const relativeValue = minimumValue - value;
    const v = minimumValue < 0 ? Math.abs(relativeValue) : value - minimumValue; // for negatives
    const ratio = v / range;
    const x = ratio * this.state.trackSize.width;
    return x;
  }

  getValueForX(x: number) {
    const {maximumValue, minimumValue, step} = this.props;
    const ratio = x / (this.state.trackSize.width - this.initialThumbSize.width / 2);
    const range = this.getRange();

    if (step) {
      return Math.max(minimumValue, Math.min(maximumValue, minimumValue + Math.round((ratio * range) / step) * step));
    } else {
      return Math.max(minimumValue, Math.min(maximumValue, ratio * range + minimumValue));
    }
  }

  getRange() {
    const {minimumValue, maximumValue} = this.props;
    const range = maximumValue - minimumValue;
    return range;
  }

  /* Events */

  onOrientationChanged = () => {
    this.initialValue = this.lastValue;
    this.minInitialValue = this.lastMinValue;
    this.setState({measureCompleted: false});
  };

  onRangeChange = (value: number) => {
    if (this.isDefaultThumbActive()) {
      this.lastValue = value;
    } else {
      this.lastMinValue = value;
    }

    let values = {min: this.lastMinValue, max: this.lastValue};
    
    if (Constants.isRTL && this.props.disableRTL) { // forceRTL for range slider
      const {maximumValue} = this.props;
      values = {min: maximumValue - this.lastValue, max: maximumValue - this.lastMinValue};
    }

    this.props.onRangeChange?.(values);
  };

  onValueChange = (value: number) => {
    this.lastValue = value;
    this.props.onValueChange?.(value);
  };

  onSeekStart() {
    this.props.onSeekStart?.();
  }

  onSeekEnd() {
    this.props.onSeekEnd?.();
  }

  onContainerLayout = (nativeEvent: LayoutChangeEvent) => {
    this.handleMeasure('containerSize', nativeEvent);
  };

  onTrackLayout = (nativeEvent: LayoutChangeEvent) => {
    this.setState({measureCompleted: false});
    this.handleMeasure('trackSize', nativeEvent);
  };

  onThumbLayout = (nativeEvent: LayoutChangeEvent) => {
    this.handleMeasure('thumbSize', nativeEvent);
  };

  handleTrackPress = (event: GestureResponderEvent) => {
    if (this.props.disabled) {
      return;
    }
    this.onSeekStart();
    this.updateTrackStepAndStyle(event);
    this.onSeekEnd();
  };

  handleMeasure = (name: MeasuredVariableName, {nativeEvent}: LayoutChangeEvent) => {
    const {width, height} = nativeEvent.layout;
    const size = {width, height};
    const currentSize = this[name];

    if (currentSize && width === currentSize.width && height === currentSize.height) {
      return;
    }
    this[name] = size;
    if (this.containerSize && this.thumbSize && this.trackSize) {
      this.setState({
        containerSize: this.containerSize,
        trackSize: this.trackSize,
        thumbSize: this.thumbSize
      },
      () => {
        this.setState({measureCompleted: true});
      });
    }
  };

  onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const {maximumValue, minimumValue, step} = this.props;
    const value = this.getValueForX(this._x);
    let newValue;

    switch (event.nativeEvent.actionName) {
      case 'increment':
        newValue = value !== maximumValue ? value + step : value;
        break;
      case 'decrement':
        newValue = value !== minimumValue ? value - step : value;
        break;
      default:
        newValue = value;
        break;
    }

    this._x = this.getXForValue(newValue);
    this.updateValue(this._x);
    this.moveTo(this._x);
    AccessibilityInfo.announceForAccessibility?.(`New value ${newValue}`);
  };

  onMinTouchStart = () => {
    this.setActiveThumb(this.minThumb);
  }

  onTouchStart = () => {
    this.setActiveThumb(this.thumb);
  }

  getThumbProps = () => {
    const {thumbStyle, activeThumbStyle, disableActiveStyling, disabled, thumbTintColor, thumbHitSlop} = this.props;

    return {
      disabled,
      thumbTintColor,
      thumbStyle,
      activeThumbStyle,
      disableActiveStyling,
      thumbHitSlop,
      onLayout: this.onThumbLayout
    };
  }

  /* Renders */
  renderMinThumb = () => {
    return (
      <Thumb
        {...this.getThumbProps()}
        ref={this.minThumb}
        onTouchStart={this.onMinTouchStart}
        {...this.panResponder.panHandlers}
      />
    );
  };

  renderThumb = () => {
    return (
      <Thumb
        {...this.getThumbProps()}
        ref={this.thumb}
        onTouchStart={this.onTouchStart}
        {...this.panResponder.panHandlers}
      />
    );
  };

  renderTrack() {
    const {
      trackStyle,
      renderTrack,
      disabled,
      minimumTrackTintColor = ACTIVE_COLOR,
      maximumTrackTintColor = DEFAULT_COLOR
    } = this.props;

    return (
      _.isFunction(renderTrack) ? (
        <View
          style={[styles.track, {backgroundColor: maximumTrackTintColor}, trackStyle]}
          onLayout={this.onTrackLayout}
        >
          {renderTrack()}
        </View>
      ) : (
        <View>
          <View
            style={[
              styles.track,
              trackStyle,
              {
                backgroundColor: disabled ? INACTIVE_COLOR : maximumTrackTintColor
              }
            ]}
            onLayout={this.onTrackLayout}
          />
          <View
            ref={this.minTrack}
            style={[
              styles.track,
              trackStyle,
              styles.minimumTrack,
              this.shouldForceLTR && styles.trackDisableRTL,
              {
                backgroundColor: disabled ? DEFAULT_COLOR : minimumTrackTintColor
              }
            ]}
          />
        </View>
      )
    );
  }

  render() {
    const {containerStyle, testID, useRange} = this.props;
    
    return (
      <View
        style={[styles.container, containerStyle]}
        onLayout={this.onContainerLayout}
        onAccessibilityAction={this.onAccessibilityAction}
        testID={testID}
        {...this.getAccessibilityProps()}
      >
        {this.renderTrack()}
        <View style={styles.touchArea} onTouchEnd={this.handleTrackPress}/>
        <View style={[!this.isDefaultThumbActive() ? {zIndex: 1} : {zIndex: 0}, {top: '-50%'}]}>
          {useRange && this.renderMinThumb()}
        </View>
        {this.renderThumb()}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    height: THUMB_SIZE + SHADOW_RADIUS,
    justifyContent: 'center'
  },
  track: {
    height: TRACK_SIZE,
    borderRadius: TRACK_SIZE / 2,
    overflow: 'hidden'
  },
  minimumTrack: {
    position: 'absolute'
  },
  trackDisableRTL: {
    right: 0
  },
  touchArea: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent'
  }
});
