[Skip to contents](#main-content)

Search(`⌘``k`)Navigation

Overview

* [Quick start](/react/overview/quick-start)
* [Accessibility](/react/overview/accessibility)
* [Releases](/react/overview/releases)
* [Community](/react/overview/community)
* [About](/react/overview/about)

Handbook

* [Styling](/react/handbook/styling)
* [Animation](/react/handbook/animation)
* [Composition](/react/handbook/composition)
* [Customization](/react/handbook/customization)
* [Forms](/react/handbook/forms)
* [TypeScript](/react/handbook/typescript)
* [llms.txt](/llms.txt)

Components

* [Accordion](/react/components/accordion)
* [Alert Dialog](/react/components/alert-dialog)
* [Autocomplete](/react/components/autocomplete)
* [Avatar](/react/components/avatar)
* [Button](/react/components/button)
* [Checkbox](/react/components/checkbox)
* [Checkbox Group](/react/components/checkbox-group)
* [Collapsible](/react/components/collapsible)
* [Combobox](/react/components/combobox)
* [Context Menu](/react/components/context-menu)
* [Dialog](/react/components/dialog)
* [Drawer](/react/components/drawer)
* [Field](/react/components/field)
* [Fieldset](/react/components/fieldset)
* [Form](/react/components/form)
* [Input](/react/components/input)
* [Menu](/react/components/menu)
* [Menubar](/react/components/menubar)
* [Meter](/react/components/meter)
* [Navigation Menu](/react/components/navigation-menu)
* [Number Field](/react/components/number-field)
* [OTP Field](/react/components/otp-field)
* [Popover](/react/components/popover)
* [Preview Card](/react/components/preview-card)
* [Progress](/react/components/progress)
* [Radio Group](/react/components/radio-group)
* [Scroll Area](/react/components/scroll-area)
* [Select](/react/components/select)
* [Separator](/react/components/separator)
* [Slider](/react/components/slider)
* [Switch](/react/components/switch)
* [Tabs](/react/components/tabs)
* [Toast](/react/components/toast)
* [Toggle](/react/components/toggle)
* [Toggle Group](/react/components/toggle-group)
* [Toolbar](/react/components/toolbar)
* [Tooltip](/react/components/tooltip)

Utils

* [CSP Provider](/react/utils/csp-provider)
* [Direction Provider](/react/utils/direction-provider)
* [mergeProps](/react/utils/merge-props)
* [useRender](/react/utils/use-render)

---

* [GitHub](https://github.com/mui/base-ui)
* [npm1.8.0](https://www.npmjs.com/package/%40base-ui/react)

Slider

* (Top)
* [Usage guidelines](#usage-guidelines)
* [Anatomy](#anatomy)
* [Examples](#examples)
  + [Labeling a slider](#labeling-a-slider)
  + [Range slider](#range-slider)
  + [Steps](#steps)
  + [Marks](#marks)
  + [Thumb alignment](#thumb-alignment)
  + [Vertical](#vertical)
  + [Form integration](#form-integration)
* [API reference](#api-reference)
  + [Root](#root)
  + [Label](#label)
  + [Value](#value)
  + [Control](#control)
  + [Track](#track)
  + [Indicator](#indicator)
  + [Thumb](#thumb)

# Slider

An easily stylable range input.

[View as Markdown](/react/components/slider.md)[View source](https://github.com/mui/base-ui/tree/v1.8.0/packages/react/src/slider)

[index.tsx](#hero:css-modules:index.tsx)[index.module.css](#hero:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Slider } from '@base-ui/react/slider';
import styles from './index.module.css';

export default function ExampleSlider() {
  return (
    <Slider.Root defaultValue={25}>
      <Slider.Control className={styles.Control}>
        <Slider.Track className={styles.Track}>
          <Slider.Indicator className={styles.Indicator} />
          <Slider.Thumb aria-label="Volume" className={styles.Thumb} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
```

Show code

## [Usage guidelines](#usage-guidelines)

* **Form controls must have an accessible name**: Prefer `<Slider.Label>`, or provide an `aria-label` on each `<Slider.Thumb>` when no visible label is rendered. See [Labeling a slider](#labeling-a-slider) and the [forms guide](/react/handbook/forms).

## [Anatomy](#anatomy)

Import the component and assemble its parts:

Anatomy

```
import { Slider } from '@base-ui/react/slider';

<Slider.Root>
  <Slider.Label />
  <Slider.Value />
  <Slider.Control>
    <Slider.Track>
      <Slider.Indicator />
      <Slider.Thumb />
    </Slider.Track>
  </Slider.Control>
</Slider.Root>
```

## [Examples](#examples)

### [Labeling a slider](#labeling-a-slider)

A single-thumb slider without a visible label (such as a volume control) can be labeled using `aria-label` on `<Slider.Thumb>`:

Slider with invisible label

```
<Slider.Root>
  <Slider.Control>
    <Slider.Track>
      <Slider.Indicator />
      <Slider.Thumb aria-label="Volume" />
    </Slider.Track>
  </Slider.Control>
</Slider.Root>
```

A visible label can be created using `<Slider.Label>`:

Slider with visible label

```
<Slider.Root>
  <Slider.Label>Volume</Slider.Label>
  <Slider.Control>
    <Slider.Track>
      <Slider.Indicator />
      <Slider.Thumb />
    </Slider.Track>
  </Slider.Control>
</Slider.Root>
```

For a multi-thumb range slider with a visible label, add `aria-label` on each `<Slider.Thumb>` to distinguish them:

Labeling multi-thumb range sliders

```
<Slider.Root defaultValue={[25, 75]}>
  <Slider.Label>Price range</Slider.Label>
  <Slider.Control>
    <Slider.Track>
      <Slider.Indicator />
      <Slider.Thumb index={0} aria-label="Minimum price" />
      <Slider.Thumb index={1} aria-label="Maximum price" />
    </Slider.Track>
  </Slider.Control>
</Slider.Root>
```

### [Range slider](#range-slider)

To create a range slider:

1. Pass an array of values and place a `<Slider.Thumb>` for each value in the array
2. Additionally for server-side rendering, specify a numeric `index` for each thumb that corresponds to the index of its value in the value array

Thumbs can be configured to behave differently when they collide during pointer interactions using the `thumbCollisionBehavior` prop on `<Slider.Root>`.

[index.tsx](#range-slider:css-modules:index.tsx)[index.module.css](#range-slider:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Slider } from '@base-ui/react/slider';
import styles from './index.module.css';

export default function RangeSlider() {
  return (
    <Slider.Root defaultValue={[25, 45]}>
      <Slider.Control className={styles.Control}>
        <Slider.Track className={styles.Track}>
          <Slider.Indicator className={styles.Indicator} />
          <Slider.Thumb index={0} aria-label="Minimum value" className={styles.Thumb} />
          <Slider.Thumb index={1} aria-label="Maximum value" className={styles.Thumb} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
```

Show code

### [Steps](#steps)

Use the `step` prop to snap the value to multiples of a given increment, and `largeStep` to control the increment when using Page Up/Page Down or Shift + Arrow Up/Arrow Down.

Font weight

400

[index.tsx](#steps:css-modules:index.tsx)[index.module.css](#steps:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Slider } from '@base-ui/react/slider';
import styles from './index.module.css';

export default function StepsSlider() {
  return (
    <Slider.Root
      className={styles.Root}
      defaultValue={400}
      min={100}
      max={900}
      step={100}
      largeStep={200}
    >
      <Slider.Label className={styles.Label}>Font weight</Slider.Label>
      <Slider.Value className={styles.Value} />
      <Slider.Control className={styles.Control}>
        <Slider.Track className={styles.Track}>
          <Slider.Indicator className={styles.Indicator} />
          <Slider.Thumb className={styles.Thumb} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
```

Show code

### [Marks](#marks)

Render your own tick marks, positioning each mark along the track as a percentage of the value range.

0255075100

[index.tsx](#marks:css-modules:index.tsx)[index.module.css](#marks:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Slider } from '@base-ui/react/slider';
import styles from './index.module.css';

const MIN = 0;
const MAX = 100;
const MARKS = [0, 25, 50, 75, 100];

export default function MarksSlider() {
  return (
    <Slider.Root className={styles.Root} defaultValue={40} min={MIN} max={MAX}>
      <Slider.Control className={styles.Control}>
        <Slider.Track className={styles.Track}>
          <Slider.Indicator className={styles.Indicator} />
          {MARKS.map((mark) => (
            <div
              key={mark}
              aria-hidden
              className={styles.Mark}
              style={{ left: `${valueToPercent(mark)}%` }}
            />
          ))}
          <Slider.Thumb aria-label="Volume" className={styles.Thumb} />
        </Slider.Track>
      </Slider.Control>
      <div className={styles.MarkLabels} aria-hidden>
        {MARKS.map((mark) => (
          <span
            key={mark}
            className={styles.MarkLabel}
            style={{ left: `${valueToPercent(mark)}%` }}
          >
            {mark}
          </span>
        ))}
      </div>
    </Slider.Root>
  );
}

function valueToPercent(value: number) {
  return ((value - MIN) / (MAX - MIN)) * 100;
}
```

Show code

Marks are independent of the value’s granularity—pair them with the [`step`](#steps) prop to snap the thumb to each mark.

### [Thumb alignment](#thumb-alignment)

Set `thumbAlignment="edge"` to inset the thumb such that its edge aligns with the edge of the control when the value is at `min` or `max`, without overflowing the control like the default `"center"` alignment.

A client-only alternative `thumbAlignment="edge-client-only"` can be used to reduce bundle size but only renders after React hydration.

[index.tsx](#edge-alignment:css-modules:index.tsx)[index.module.css](#edge-alignment:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Slider } from '@base-ui/react/slider';
import styles from './index.module.css';

export default function EdgeAlignedThumb() {
  return (
    <Slider.Root thumbAlignment="edge" defaultValue={25}>
      <Slider.Control className={styles.Control}>
        <Slider.Track className={styles.Track}>
          <Slider.Indicator className={styles.Indicator} />
          <Slider.Thumb aria-label="Volume" className={styles.Thumb} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
```

Show code

### [Vertical](#vertical)

Set `orientation="vertical"` on `<Slider.Root>` to build a vertical slider.

[index.tsx](#vertical:css-modules:index.tsx)[index.module.css](#vertical:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Slider } from '@base-ui/react/slider';
import styles from './index.module.css';

export default function VerticalSlider() {
  return (
    <Slider.Root orientation="vertical" defaultValue={35}>
      <Slider.Control className={styles.Control}>
        <Slider.Track className={styles.Track}>
          <Slider.Indicator className={styles.Indicator} />
          <Slider.Thumb aria-label="Volume" className={styles.Thumb} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
```

Show code

### [Form integration](#form-integration)

To use a slider in a form, pass the slider `name` to `<Slider.Root>`:

Using Slider in a form

```
<Form>
  <Slider.Root name="volume">
    <Slider.Label>Volume</Slider.Label>
    <Slider.Control>
      <Slider.Track>
        <Slider.Indicator />
        <Slider.Thumb />
      </Slider.Track>
    </Slider.Control>
  </Slider.Root>
</Form>
```

For grouped multi-thumb range sliders in forms, [Fieldset](/react/components/fieldset) can provide the shared visible label while each thumb keeps its own `aria-label`:

Using Fieldset with a multi-thumb slider

```
<Field.Root>
  <Fieldset.Root render={<Slider.Root defaultValue={[25, 75]} />}>
    <Fieldset.Legend>Price range</Fieldset.Legend>
    <Slider.Control>
      <Slider.Track>
        <Slider.Indicator />
        <Slider.Thumb index={0} aria-label="Minimum price" />
        <Slider.Thumb index={1} aria-label="Maximum price" />
      </Slider.Track>
    </Slider.Control>
  </Fieldset.Root>
</Field.Root>
```

## [API reference](#api-reference)

### [Root](#root)

Groups all parts of the slider.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`name``string``—`

Name
:   [`name`](#SliderRoot-name)

Description
:   Identifies the field when a form is submitted.

Type
:   ```
    string | undefined
    ```

`defaultValue``number | number[]``—`

Name
:   [`defaultValue`](#SliderRoot-defaultValue)

Description
:   The uncontrolled value of the slider when it’s initially rendered.

    To render a controlled slider, use the `value` prop instead.

Type
:   ```
    number | number[] | undefined
    ```

`value``number | number[]``—`

Name
:   [`value`](#SliderRoot-value)

Description
:   The value of the slider.
    For range sliders, provide an array with one value per thumb.

Type
:   ```
    number | number[] | undefined
    ```

`onValueChange``function``—`

Name
:   [`onValueChange`](#SliderRoot-onValueChange)

Description
:   Callback function that is fired when the slider’s value changed.
    Receives the new value as the first argument; the originating event is
    available as `eventDetails.event`. The value is also reflected on
    `eventDetails.event.target.value` for form integration.

    The `eventDetails.reason` indicates what triggered the change:

    * `'input-change'` when the hidden range input emits a change event (for example, via form integration)
    * `'track-press'` when the control track is pressed
    * `'drag'` while dragging a thumb
    * `'keyboard'` for keyboard input
    * `'none'` when the change is triggered without a specific interaction

Type
:   ```
    | ((
        value: number | number[],
        eventDetails: Slider.Root.ChangeEventDetails,
      ) => void)
    | undefined
    ```

`onValueCommitted``function``—`

Name
:   [`onValueCommitted`](#SliderRoot-onValueCommitted)

Description
:   Callback function that is fired when a value change is committed.
    Does not fire if the value did not change, or if the change was canceled.
    **Warning**: This is a generic event, not a change event.

    The `eventDetails.reason` indicates what triggered the commit:

    * `'drag'` while dragging a thumb
    * `'track-press'` when the control track is pressed
    * `'keyboard'` for keyboard input
    * `'input-change'` when the hidden range input emits a change event (for example, via form integration)
    * `'none'` when the commit occurs without a specific interaction

Type
:   ```
    | ((
        value: number | number[],
        eventDetails: Slider.Root.CommitEventDetails,
      ) => void)
    | undefined
    ```

`form``string``—`

Name
:   [`form`](#SliderRoot-form)

Description
:   Identifies the form that owns the slider inputs.
    Useful when the slider is rendered outside the form.

Type
:   ```
    string | undefined
    ```

`locale``Intl.LocalesArgument``—`

Name
:   [`locale`](#SliderRoot-locale)

Description
:   The locale used by `Intl.NumberFormat` when formatting the value.
    Defaults to the user’s runtime locale.

Type
:   ```
    Intl.LocalesArgument | undefined
    ```

`thumbAlignment``Union``'center'`

Name
:   [`thumbAlignment`](#SliderRoot-thumbAlignment)

Description
:   How the thumb(s) are aligned relative to `Slider.Control` when the value is at `min` or `max`:

    * `center`: The center of the thumb is aligned with the control edge
    * `edge`: The thumb is inset within the control such that its edge is aligned with the control edge
    * `edge-client-only`: Same as `edge` but renders after React hydration on the client, reducing bundle size in return

Type
:   ```
    'center' | 'edge' | 'edge-client-only' | undefined
    ```

Default
:   `'center'`

`thumbCollisionBehavior``Union``'push'`

Name
:   [`thumbCollisionBehavior`](#SliderRoot-thumbCollisionBehavior)

Description
:   Controls how thumbs behave when they collide during pointer interactions.

    * `'push'` (default): Thumbs push each other without restoring their previous positions when dragged back.
    * `'swap'`: Thumbs swap places when dragged past each other.
    * `'none'`: Thumbs cannot move past each other; excess movement is ignored.

Type
:   ```
    'push' | 'swap' | 'none' | undefined
    ```

Default
:   `'push'`

`step``number``1`

Name
:   [`step`](#SliderRoot-step)

Description
:   The granularity with which the slider can step through values. (A “discrete” slider.)
    The `min` prop serves as the origin for the valid values.
    We recommend (max — min) to be evenly divisible by the step.

Type
:   ```
    number | undefined
    ```

Default
:   `1`

`largeStep``number``10`

Name
:   [`largeStep`](#SliderRoot-largeStep)

Description
:   The granularity with which the slider can step through values when using Page Up/Page Down or Shift + Arrow Up/Arrow Down.

Type
:   ```
    number | undefined
    ```

Default
:   `10`

`minStepsBetweenValues``number``0`

Name
:   [`minStepsBetweenValues`](#SliderRoot-minStepsBetweenValues)

Description
:   The minimum steps between values in a range slider.

Type
:   ```
    number | undefined
    ```

Default
:   `0`

`min``number``0`

Name
:   [`min`](#SliderRoot-min)

Description
:   The minimum allowed value of the slider.
    Should not be equal to max.

Type
:   ```
    number | undefined
    ```

Default
:   `0`

`max``number``100`

Name
:   [`max`](#SliderRoot-max)

Description
:   The maximum allowed value of the slider.
    Should not be equal to min.

Type
:   ```
    number | undefined
    ```

Default
:   `100`

`format``Intl.NumberFormatOptions``—`

Name
:   [`format`](#SliderRoot-format)

Description
:   Options to format the value.

Type
:   ```
    Intl.NumberFormatOptions | undefined
    ```

`disabled``boolean``false`

Name
:   [`disabled`](#SliderRoot-disabled)

Description
:   Whether the slider should ignore user interaction.

Type
:   ```
    boolean | undefined
    ```

Default
:   `false`

`orientation``Orientation``'horizontal'`

Name
:   [`orientation`](#SliderRoot-orientation)

Description
:   The component orientation.

Type
:   ```
    'horizontal' | 'vertical' | undefined
    ```

Default
:   `'horizontal'`

`className``string | function``—`

Name
:   [`className`](#SliderRoot-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Slider.Root.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#SliderRoot-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Slider.Root.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#SliderRoot-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Slider.Root.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-dragging`

Present while the user is dragging.

`data-orientation`

Indicates the orientation of the slider.

`data-disabled`

Present when the slider is disabled.

`data-valid`

Present when the slider is in a valid state (when wrapped in Field.Root).

`data-invalid`

Present when the slider is in an invalid state (when wrapped in Field.Root).

`data-dirty`

Present when the slider’s value has changed (when wrapped in Field.Root).

`data-touched`

Present when the slider has been touched (when wrapped in Field.Root).

`data-focused`

Present when the slider is focused (when wrapped in Field.Root).

| Attribute | Description | - |
| --- | --- | --- |
| `data-dragging` | Present while the user is dragging. | |
| `data-orientation` | Indicates the orientation of the slider. | |
| `data-disabled` | Present when the slider is disabled. | |
| `data-valid` | Present when the slider is in a valid state (when wrapped in Field.Root). | |
| `data-invalid` | Present when the slider is in an invalid state (when wrapped in Field.Root). | |
| `data-dirty` | Present when the slider’s value has changed (when wrapped in Field.Root). | |
| `data-touched` | Present when the slider has been touched (when wrapped in Field.Root). | |
| `data-focused` | Present when the slider is focused (when wrapped in Field.Root). | |

### Slider.Root.PropsHide

Re-Export of [Root](#root) props as `SliderRootProps`

### Slider.Root.StateHide

```
type SliderRootState = {
  /** The index of the active thumb. */
  activeThumbIndex: number;
  /** Whether the component should ignore user interaction. */
  disabled: boolean;
  /** Whether the thumb is currently being dragged. */
  dragging: boolean;
  /** The maximum value. */
  max: number;
  /** The minimum value. */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /** The component orientation. */
  orientation: 'horizontal' | 'vertical';
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /** The raw number value of the slider. */
  values: number[];
  /** Whether the field has been touched. */
  touched: boolean;
  /** Whether the field value has changed from its initial value. */
  dirty: boolean;
  /** Whether the field is valid. */
  valid: boolean | null;
  /** Whether the field has a value. */
  filled: boolean;
  /** Whether the field is focused. */
  focused: boolean;
}
```

### Slider.Root.ChangeEventReasonHide

```
type SliderRootChangeEventReason = 'input-change' | 'track-press' | 'drag' | 'keyboard' | 'none'
```

### Slider.Root.ChangeEventDetailsHide

```
type SliderRootChangeEventDetails = (
  | { reason: 'none'; event: Event }
  | { reason: 'input-change'; event: Event | InputEvent }
  | { reason: 'track-press'; event: PointerEvent | MouseEvent | TouchEvent }
  | { reason: 'drag'; event: PointerEvent | TouchEvent }
  | { reason: 'keyboard'; event: KeyboardEvent }
) & {
  /** Cancels Base UI from handling the event. */
  cancel: () => void;
  /** Allows the event to propagate in cases where Base UI will stop the propagation. */
  allowPropagation: () => void;
  /** Indicates whether the event has been canceled. */
  isCanceled: boolean;
  /** Indicates whether the event is allowed to propagate. */
  isPropagationAllowed: boolean;
  /** The element that triggered the event, if applicable. */
  trigger: Element | undefined;
  /** The index of the active thumb at the time of the change. */
  activeThumbIndex: number;
}
```

### Slider.Root.CommitEventReasonHide

```
type SliderRootCommitEventReason = 'input-change' | 'track-press' | 'drag' | 'keyboard' | 'none'
```

### Slider.Root.CommitEventDetailsHide

```
type SliderRootCommitEventDetails =
  | { reason: 'none'; event: Event }
  | { reason: 'input-change'; event: Event | InputEvent }
  | { reason: 'track-press'; event: PointerEvent | MouseEvent | TouchEvent }
  | { reason: 'drag'; event: PointerEvent | TouchEvent }
  | { reason: 'keyboard'; event: KeyboardEvent }
```

### [Label](#label)

An accessible label that is automatically associated with the slider thumbs.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`className``string | function``—`

Name
:   [`className`](#SliderLabel-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Slider.Root.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#SliderLabel-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Slider.Root.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#SliderLabel-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Slider.Root.State,
      ) => ReactElement)
    | undefined
    ```

### Slider.Label.PropsHide

Re-Export of [Label](#label) props as `SliderLabelProps`

### Slider.Label.StateHide

```
type SliderLabelState = {
  /** The index of the active thumb. */
  activeThumbIndex: number;
  /** Whether the component should ignore user interaction. */
  disabled: boolean;
  /** Whether the thumb is currently being dragged. */
  dragging: boolean;
  /** The maximum value. */
  max: number;
  /** The minimum value. */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /** The component orientation. */
  orientation: 'horizontal' | 'vertical';
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /** The raw number value of the slider. */
  values: number[];
  /** Whether the field has been touched. */
  touched: boolean;
  /** Whether the field value has changed from its initial value. */
  dirty: boolean;
  /** Whether the field is valid. */
  valid: boolean | null;
  /** Whether the field has a value. */
  filled: boolean;
  /** Whether the field is focused. */
  focused: boolean;
}
```

### [Value](#value)

Displays the current value of the slider as text.
Renders an `<output>` element.

Component props table

Prop

Type

Default

`children``| ((formattedValues: string[], values: number[]) => React.ReactNode)
|  null``—`

Name
:   [`children`](#SliderValue-children)

Type
:   ```
    | ((
        formattedValues: string[],
        values: number[],
      ) => React.ReactNode)
    | null
    | undefined
    ```

`className``string | function``—`

Name
:   [`className`](#SliderValue-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Slider.Value.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#SliderValue-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Slider.Value.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#SliderValue-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Slider.Value.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-dragging`

Present while the user is dragging.

`data-orientation`

Indicates the orientation of the slider.

`data-disabled`

Present when the slider is disabled.

`data-valid`

Present when the slider is in a valid state (when wrapped in Field.Root).

`data-invalid`

Present when the slider is in an invalid state (when wrapped in Field.Root).

`data-dirty`

Present when the slider’s value has changed (when wrapped in Field.Root).

`data-touched`

Present when the slider has been touched (when wrapped in Field.Root).

`data-focused`

Present when the slider is focused (when wrapped in Field.Root).

| Attribute | Description | - |
| --- | --- | --- |
| `data-dragging` | Present while the user is dragging. | |
| `data-orientation` | Indicates the orientation of the slider. | |
| `data-disabled` | Present when the slider is disabled. | |
| `data-valid` | Present when the slider is in a valid state (when wrapped in Field.Root). | |
| `data-invalid` | Present when the slider is in an invalid state (when wrapped in Field.Root). | |
| `data-dirty` | Present when the slider’s value has changed (when wrapped in Field.Root). | |
| `data-touched` | Present when the slider has been touched (when wrapped in Field.Root). | |
| `data-focused` | Present when the slider is focused (when wrapped in Field.Root). | |

### Slider.Value.PropsHide

Re-Export of [Value](#value) props as `SliderValueProps`

### Slider.Value.StateHide

```
type SliderValueState = {
  /** The index of the active thumb. */
  activeThumbIndex: number;
  /** Whether the component should ignore user interaction. */
  disabled: boolean;
  /** Whether the thumb is currently being dragged. */
  dragging: boolean;
  /** The maximum value. */
  max: number;
  /** The minimum value. */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /** The component orientation. */
  orientation: 'horizontal' | 'vertical';
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /** The raw number value of the slider. */
  values: number[];
  /** Whether the field has been touched. */
  touched: boolean;
  /** Whether the field value has changed from its initial value. */
  dirty: boolean;
  /** Whether the field is valid. */
  valid: boolean | null;
  /** Whether the field has a value. */
  filled: boolean;
  /** Whether the field is focused. */
  focused: boolean;
}
```

### [Control](#control)

The clickable, interactive part of the slider.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`className``string | function``—`

Name
:   [`className`](#SliderControl-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Slider.Control.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#SliderControl-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Slider.Control.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#SliderControl-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Slider.Control.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-dragging`

Present while the user is dragging.

`data-orientation`

Indicates the orientation of the slider.

`data-disabled`

Present when the slider is disabled.

`data-valid`

Present when the slider is in a valid state (when wrapped in Field.Root).

`data-invalid`

Present when the slider is in an invalid state (when wrapped in Field.Root).

`data-dirty`

Present when the slider’s value has changed (when wrapped in Field.Root).

`data-touched`

Present when the slider has been touched (when wrapped in Field.Root).

`data-focused`

Present when the slider is focused (when wrapped in Field.Root).

| Attribute | Description | - |
| --- | --- | --- |
| `data-dragging` | Present while the user is dragging. | |
| `data-orientation` | Indicates the orientation of the slider. | |
| `data-disabled` | Present when the slider is disabled. | |
| `data-valid` | Present when the slider is in a valid state (when wrapped in Field.Root). | |
| `data-invalid` | Present when the slider is in an invalid state (when wrapped in Field.Root). | |
| `data-dirty` | Present when the slider’s value has changed (when wrapped in Field.Root). | |
| `data-touched` | Present when the slider has been touched (when wrapped in Field.Root). | |
| `data-focused` | Present when the slider is focused (when wrapped in Field.Root). | |

### Slider.Control.PropsHide

Re-Export of [Control](#control) props as `SliderControlProps`

### Slider.Control.StateHide

```
type SliderControlState = {
  /** The index of the active thumb. */
  activeThumbIndex: number;
  /** Whether the component should ignore user interaction. */
  disabled: boolean;
  /** Whether the thumb is currently being dragged. */
  dragging: boolean;
  /** The maximum value. */
  max: number;
  /** The minimum value. */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /** The component orientation. */
  orientation: 'horizontal' | 'vertical';
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /** The raw number value of the slider. */
  values: number[];
  /** Whether the field has been touched. */
  touched: boolean;
  /** Whether the field value has changed from its initial value. */
  dirty: boolean;
  /** Whether the field is valid. */
  valid: boolean | null;
  /** Whether the field has a value. */
  filled: boolean;
  /** Whether the field is focused. */
  focused: boolean;
}
```

### [Track](#track)

Contains the slider indicator and represents the entire range of the slider.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`className``string | function``—`

Name
:   [`className`](#SliderTrack-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Slider.Track.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#SliderTrack-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Slider.Track.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#SliderTrack-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Slider.Track.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-dragging`

Present while the user is dragging.

`data-orientation`

Indicates the orientation of the slider.

`data-disabled`

Present when the slider is disabled.

`data-valid`

Present when the slider is in a valid state (when wrapped in Field.Root).

`data-invalid`

Present when the slider is in an invalid state (when wrapped in Field.Root).

`data-dirty`

Present when the slider’s value has changed (when wrapped in Field.Root).

`data-touched`

Present when the slider has been touched (when wrapped in Field.Root).

`data-focused`

Present when the slider is focused (when wrapped in Field.Root).

| Attribute | Description | - |
| --- | --- | --- |
| `data-dragging` | Present while the user is dragging. | |
| `data-orientation` | Indicates the orientation of the slider. | |
| `data-disabled` | Present when the slider is disabled. | |
| `data-valid` | Present when the slider is in a valid state (when wrapped in Field.Root). | |
| `data-invalid` | Present when the slider is in an invalid state (when wrapped in Field.Root). | |
| `data-dirty` | Present when the slider’s value has changed (when wrapped in Field.Root). | |
| `data-touched` | Present when the slider has been touched (when wrapped in Field.Root). | |
| `data-focused` | Present when the slider is focused (when wrapped in Field.Root). | |

### Slider.Track.PropsHide

Re-Export of [Track](#track) props as `SliderTrackProps`

### Slider.Track.StateHide

```
type SliderTrackState = {
  /** The index of the active thumb. */
  activeThumbIndex: number;
  /** Whether the component should ignore user interaction. */
  disabled: boolean;
  /** Whether the thumb is currently being dragged. */
  dragging: boolean;
  /** The maximum value. */
  max: number;
  /** The minimum value. */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /** The component orientation. */
  orientation: 'horizontal' | 'vertical';
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /** The raw number value of the slider. */
  values: number[];
  /** Whether the field has been touched. */
  touched: boolean;
  /** Whether the field value has changed from its initial value. */
  dirty: boolean;
  /** Whether the field is valid. */
  valid: boolean | null;
  /** Whether the field has a value. */
  filled: boolean;
  /** Whether the field is focused. */
  focused: boolean;
}
```

### [Indicator](#indicator)

Visualizes the current value of the slider.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`className``string | function``—`

Name
:   [`className`](#SliderIndicator-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Slider.Indicator.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#SliderIndicator-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Slider.Indicator.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#SliderIndicator-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Slider.Indicator.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-dragging`

Present while the user is dragging.

`data-orientation`

Indicates the orientation of the slider.

`data-disabled`

Present when the slider is disabled.

`data-valid`

Present when the slider is in a valid state (when wrapped in Field.Root).

`data-invalid`

Present when the slider is in an invalid state (when wrapped in Field.Root).

`data-dirty`

Present when the slider’s value has changed (when wrapped in Field.Root).

`data-touched`

Present when the slider has been touched (when wrapped in Field.Root).

`data-focused`

Present when the slider is focused (when wrapped in Field.Root).

| Attribute | Description | - |
| --- | --- | --- |
| `data-dragging` | Present while the user is dragging. | |
| `data-orientation` | Indicates the orientation of the slider. | |
| `data-disabled` | Present when the slider is disabled. | |
| `data-valid` | Present when the slider is in a valid state (when wrapped in Field.Root). | |
| `data-invalid` | Present when the slider is in an invalid state (when wrapped in Field.Root). | |
| `data-dirty` | Present when the slider’s value has changed (when wrapped in Field.Root). | |
| `data-touched` | Present when the slider has been touched (when wrapped in Field.Root). | |
| `data-focused` | Present when the slider is focused (when wrapped in Field.Root). | |

### Slider.Indicator.PropsHide

Re-Export of [Indicator](#indicator) props as `SliderIndicatorProps`

### Slider.Indicator.StateHide

```
type SliderIndicatorState = {
  /** The index of the active thumb. */
  activeThumbIndex: number;
  /** Whether the component should ignore user interaction. */
  disabled: boolean;
  /** Whether the thumb is currently being dragged. */
  dragging: boolean;
  /** The maximum value. */
  max: number;
  /** The minimum value. */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /** The component orientation. */
  orientation: 'horizontal' | 'vertical';
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /** The raw number value of the slider. */
  values: number[];
  /** Whether the field has been touched. */
  touched: boolean;
  /** Whether the field value has changed from its initial value. */
  dirty: boolean;
  /** Whether the field is valid. */
  valid: boolean | null;
  /** Whether the field has a value. */
  filled: boolean;
  /** Whether the field is focused. */
  focused: boolean;
}
```

### [Thumb](#thumb)

The draggable part of the slider at the tip of the indicator.
Renders a `<div>` element and a nested `<input type="range">`.

Component props table

Prop

Type

Default

`aria-valuetext``string``—`

Name
:   [`aria-valuetext`](#SliderThumb-aria-valuetext)

Description
:   A string value forwarded to the [`aria-valuetext`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-valuetext) attribute of the `input`.
    Ignored when `getAriaValueText` is provided.

Type
:   ```
    string | undefined
    ```

`getAriaLabel``function``—`

Name
:   [`getAriaLabel`](#SliderThumb-getAriaLabel)

Description
:   A function which returns a string value for the [`aria-label`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-label) attribute of the `input`.

Type
:   ```
    ((index: number) => string) | null | undefined
    ```

`getAriaValueText``function``—`

Name
:   [`getAriaValueText`](#SliderThumb-getAriaValueText)

Description
:   A function which returns a string value for the [`aria-valuetext`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-valuetext) attribute of the `input`.
    This is important for screen reader users.

Type
:   ```
    | ((
        formattedValue: string,
        value: number,
        index: number,
      ) => string)
    | null
    | undefined
    ```

`index``number``—`

Name
:   [`index`](#SliderThumb-index)

Description
:   The index of the thumb which corresponds to the index of its value in the
    `value` or `defaultValue` array.
    This prop is required to support server-side rendering for range sliders
    with multiple thumbs.

Type
:   ```
    number | undefined
    ```

Example
:   ```
    <Slider.Root value={[10, 20]}>
      <Slider.Thumb index={0} />
      <Slider.Thumb index={1} />
    </Slider.Root>
    ```

`onBlur``function``—`

Name
:   [`onBlur`](#SliderThumb-onBlur)

Description
:   A blur handler forwarded to the `input`.

Type
:   ```
    React.FocusEventHandler<HTMLInputElement> | undefined
    ```

`onFocus``function``—`

Name
:   [`onFocus`](#SliderThumb-onFocus)

Description
:   A focus handler forwarded to the `input`.

Type
:   ```
    React.FocusEventHandler<HTMLInputElement> | undefined
    ```

`onKeyDown``function``—`

Name
:   [`onKeyDown`](#SliderThumb-onKeyDown)

Description
:   A keydown handler forwarded to the `input`.

Type
:   ```
    React.KeyboardEventHandler<HTMLInputElement> | undefined
    ```

`tabIndex``number``—`

Name
:   [`tabIndex`](#SliderThumb-tabIndex)

Description
:   Optional tab index attribute forwarded to the `input`.

Type
:   ```
    number | undefined
    ```

`disabled``boolean``false`

Name
:   [`disabled`](#SliderThumb-disabled)

Description
:   Whether the thumb should ignore user interaction.

Type
:   ```
    boolean | undefined
    ```

Default
:   `false`

`inputRef``React.Ref<HTMLInputElement>``—`

Name
:   [`inputRef`](#SliderThumb-inputRef)

Description
:   A ref to access the nested input element.

Type
:   ```
    React.Ref<HTMLInputElement> | undefined
    ```

`className``string | function``—`

Name
:   [`className`](#SliderThumb-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Slider.Thumb.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#SliderThumb-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Slider.Thumb.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#SliderThumb-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Slider.Thumb.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-dragging`

Present while the user is dragging.

`data-orientation`

Indicates the orientation of the slider.

`data-disabled`

Present when the slider is disabled.

`data-valid`

Present when the slider is in a valid state (when wrapped in Field.Root).

`data-invalid`

Present when the slider is in an invalid state (when wrapped in Field.Root).

`data-dirty`

Present when the slider’s value has changed (when wrapped in Field.Root).

`data-touched`

Present when the slider has been touched (when wrapped in Field.Root).

`data-focused`

Present when the slider is focused (when wrapped in Field.Root).

`data-index`

Indicates the index of the thumb in range sliders.

| Attribute | Description | - |
| --- | --- | --- |
| `data-dragging` | Present while the user is dragging. | |
| `data-orientation` | Indicates the orientation of the slider. | |
| `data-disabled` | Present when the slider is disabled. | |
| `data-valid` | Present when the slider is in a valid state (when wrapped in Field.Root). | |
| `data-invalid` | Present when the slider is in an invalid state (when wrapped in Field.Root). | |
| `data-dirty` | Present when the slider’s value has changed (when wrapped in Field.Root). | |
| `data-touched` | Present when the slider has been touched (when wrapped in Field.Root). | |
| `data-focused` | Present when the slider is focused (when wrapped in Field.Root). | |
| `data-index` | Indicates the index of the thumb in range sliders. | |

### Slider.Thumb.PropsHide

Re-Export of [Thumb](#thumb) props as `SliderThumbProps`

### Slider.Thumb.StateHide

```
type SliderThumbState = {
  /** The index of the active thumb. */
  activeThumbIndex: number;
  /** Whether the component should ignore user interaction. */
  disabled: boolean;
  /** Whether the thumb is currently being dragged. */
  dragging: boolean;
  /** The maximum value. */
  max: number;
  /** The minimum value. */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /** The component orientation. */
  orientation: 'horizontal' | 'vertical';
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /** The raw number value of the slider. */
  values: number[];
  /** Whether the field has been touched. */
  touched: boolean;
  /** Whether the field value has changed from its initial value. */
  dirty: boolean;
  /** Whether the field is valid. */
  valid: boolean | null;
  /** Whether the field has a value. */
  filled: boolean;
  /** Whether the field is focused. */
  focused: boolean;
}
```
