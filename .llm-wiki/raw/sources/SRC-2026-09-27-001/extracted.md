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

Dialog

* (Top)
* [Usage guidelines](#usage-guidelines)
* [Anatomy](#anatomy)
* [Examples](#examples)
  + [State](#state)
  + [Open from a menu](#open-from-a-menu)
  + [Nested dialogs](#nested-dialogs)
  + [Close confirmation](#close-confirmation)
  + [Custom focus management](#custom-focus-management)
  + [Outside scroll dialog](#outside-scroll-dialog)
  + [Inside scroll dialog](#inside-scroll-dialog)
  + [Placing elements outside the popup](#placing-elements-outside-the-popup)
  + [Detached triggers](#detached-triggers)
  + [Multiple triggers](#multiple-triggers)
  + [Controlled mode with multiple triggers](#controlled-mode-with-multiple-triggers)
* [API reference](#api-reference)
  + [Root](#root)
  + [Trigger](#trigger)
  + [Portal](#portal)
  + [Backdrop](#backdrop)
  + [Viewport](#viewport)
  + [Popup](#popup)
  + [Title](#title)
  + [Description](#description)
  + [Close](#close)
* [createHandle](#createhandle)

# Dialog

A popup that opens on top of the entire page.

[View as Markdown](/react/components/dialog.md)[View source](https://github.com/mui/base-ui/tree/v1.8.0/packages/react/src/dialog)

View notifications

[index.tsx](#hero:css-modules:index.tsx)[index.module.css](#hero:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Dialog } from '@base-ui/react/dialog';
import styles from './index.module.css';

export default function ExampleDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.Button}>View notifications</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.Backdrop} />
        <Dialog.Popup className={styles.Popup}>
          <div className={styles.Intro}>
            <Dialog.Title className={styles.Title}>Notifications</Dialog.Title>
            <Dialog.Description className={styles.Description}>
              You are all caught up. Good job!
            </Dialog.Description>
          </div>
          <div className={styles.Actions}>
            <Dialog.Close className={styles.Button}>Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Show code

## [Usage guidelines](#usage-guidelines)

* **Dialog doesn’t support gestures:** Use [Drawer](/react/components/drawer) when you need gesture support or snap points. A panel that slides in from the edge of the screen and doesn’t need gesture support is a positioned Dialog.

## [Anatomy](#anatomy)

Import the component and assemble its parts:

Anatomy

```
import { Dialog } from '@base-ui/react/dialog';

<Dialog.Root>
  <Dialog.Trigger />
  <Dialog.Portal>
    <Dialog.Backdrop />
    <Dialog.Viewport>
      <Dialog.Popup>
        <Dialog.Title />
        <Dialog.Description />
        <Dialog.Close />
      </Dialog.Popup>
    </Dialog.Viewport>
  </Dialog.Portal>
</Dialog.Root>
```

## [Examples](#examples)

### [State](#state)

By default, Dialog is an uncontrolled component that manages its own state.

Uncontrolled dialog

```
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Popup>
      <Dialog.Title>Example dialog</Dialog.Title>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

Use `open` and `onOpenChange` props if you need to access or control the state of the dialog.
For example, you can control the dialog state in order to open it imperatively from another place in your app.

Controlled dialog

```
const [open, setOpen] = React.useState(false);
return (
  <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger>Open</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Popup>
        <form
          // Close the dialog once the form data is submitted
          onSubmit={async () => {
            await submitData();
            setOpen(false);
          }}
        >
          ...
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
```

It’s also common to use `onOpenChange` if your app needs to do something when the dialog is closed or opened. This is recommended over `React.useEffect` when reacting to state changes.

Running code when dialog state changes

```
<Dialog.Root
  open={open}
  onOpenChange={(open) => {
    // Do stuff when the dialog is closed
    if (!open) {
      doStuff();
    }
    // Set the new state
    setOpen(open);
  }}
>
```

### [Open from a menu](#open-from-a-menu)

In order to open a dialog using a menu, control the dialog state and open it imperatively using the `onClick` handler on the menu item.

Playlist

[index.tsx](#open-from-menu:css-modules:index.tsx)[index.module.css](#open-from-menu:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
'use client';
import * as React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import styles from './index.module.css';

export default function ExampleDialog() {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <React.Fragment>
      <Menu.Root>
        <Menu.Trigger className={styles.Button}>
          Playlist <CaretDownIcon />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className={styles.Positioner} sideOffset={8} align="start">
            <Menu.Popup className={styles.MenuPopup}>
              <Menu.Item className={styles.MenuItem}>Play</Menu.Item>
              <Menu.Item className={styles.MenuItem}>Share</Menu.Item>
              <Menu.Separator className={styles.Separator} />
              {/* Open the dialog when the menu item is clicked */}
              <Menu.Item className={styles.MenuItem} onClick={() => setDialogOpen(true)}>
                Details…
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Control the dialog state */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.Backdrop} />
          <Dialog.Popup className={styles.DialogPopup}>
            <div className={styles.Intro}>
              <Dialog.Title className={styles.Title}>Playlist details</Dialog.Title>
              <Dialog.Description className={styles.Description}>
                This playlist contains 24 songs and was last updated today.
              </Dialog.Description>
            </div>
            <div className={styles.Actions}>
              <Dialog.Close className={styles.Button}>Close</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </React.Fragment>
  );
}

function CaretDownIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
      style={{ display: 'block', ...props.style }}
    >
      <path d="M12 6H4l4 4.5z" />
    </svg>
  );
}
```

Show code

### [Nested dialogs](#nested-dialogs)

You can nest dialogs within one another normally.

Use the `[data-nested-dialog-open]` selector and the `var(--nested-dialogs)` CSS variable to customize the styling of the parent dialog. Backdrops of the child dialogs won’t be rendered so that you can present the parent dialog in a clean way behind the one on top of it.

View notifications

[index.tsx](#nested:css-modules:index.tsx)[index.module.css](#nested:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Dialog } from '@base-ui/react/dialog';
import styles from './index.module.css';

export default function ExampleDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.Button}>View notifications</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.Backdrop} />
        <Dialog.Popup className={styles.Popup}>
          <div className={styles.Intro}>
            <Dialog.Title className={styles.Title}>Notifications</Dialog.Title>
            <Dialog.Description className={styles.Description}>
              You are all caught up. Good job!
            </Dialog.Description>
          </div>
          <div className={styles.Actions}>
            <Dialog.Root>
              <Dialog.Trigger className={styles.Button}>Customize</Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Popup className={styles.Popup}>
                  <div className={styles.Intro}>
                    <Dialog.Title className={styles.Title}>Customize notifications</Dialog.Title>
                    <Dialog.Description className={styles.Description}>
                      Review your settings here.
                    </Dialog.Description>
                  </div>
                  <div className={styles.EndActions}>
                    <Dialog.Close className={styles.Button}>Close</Dialog.Close>
                  </div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Show code

### [Close confirmation](#close-confirmation)

This example shows a nested confirmation dialog that opens if the text entered in the parent dialog is going to be discarded.

To implement this, both dialogs should be controlled. The confirmation dialog may be opened when `onOpenChange` callback of the parent dialog receives a request to close. This way, the confirmation is automatically shown when the user clicks the backdrop, presses the Esc key, or clicks a close button.

Tweet

[index.tsx](#close-confirmation:css-modules:index.tsx)[index.module.css](#close-confirmation:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
'use client';
import * as React from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog } from '@base-ui/react/dialog';
import styles from './index.module.css';

export default function ExampleDialog() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirmationOpen, setConfirmationOpen] = React.useState(false);
  const [textareaValue, setTextareaValue] = React.useState('');
  const titleId = React.useId();

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={(open) => {
        // Show the close confirmation if there’s text in the textarea
        if (!open && textareaValue) {
          setConfirmationOpen(true);
        } else {
          // Reset the text area value
          setTextareaValue('');
          // Open or close the dialog normally
          setDialogOpen(open);
        }
      }}
    >
      <Dialog.Trigger className={styles.Button}>Tweet</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.Backdrop} />
        <Dialog.Popup className={styles.Popup}>
          <div className={styles.PopupBody}>
            <Dialog.Title id={titleId} className={styles.Title}>
              New tweet
            </Dialog.Title>
            <form
              className={styles.TextareaContainer}
              onSubmit={(event) => {
                event.preventDefault();
                // Close the dialog when submitting
                setDialogOpen(false);
              }}
            >
              <textarea
                aria-labelledby={titleId}
                required
                className={styles.Textarea}
                placeholder="What’s on your mind?"
                value={textareaValue}
                onChange={(event) => setTextareaValue(event.target.value)}
              />
              <div className={styles.Actions}>
                <Dialog.Close className={styles.Button}>Cancel</Dialog.Close>
                <button type="submit" className={styles.Button}>
                  Tweet
                </button>
              </div>
            </form>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>

      {/* Confirmation dialog */}
      <AlertDialog.Root open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Popup className={styles.Popup}>
            <div className={styles.Intro}>
              <AlertDialog.Title className={styles.Title}>Discard tweet?</AlertDialog.Title>
              <AlertDialog.Description className={styles.Description}>
                Your tweet will be lost.
              </AlertDialog.Description>
            </div>
            <div className={styles.Actions}>
              <AlertDialog.Close className={styles.Button}>Go back</AlertDialog.Close>
              <button
                type="button"
                className={styles.Button}
                onClick={() => {
                  setConfirmationOpen(false);
                  setDialogOpen(false);
                }}
              >
                Discard
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Dialog.Root>
  );
}
```

Show code

### [Custom focus management](#custom-focus-management)

You can control where the focus goes when the dialog opens and closes using the `initialFocus` and `finalFocus` props on the `<Dialog.Popup>` component.

You can also set these props to `false` to prevent focus from moving when the dialog opens or closes, or to a function that returns the element to focus based on the interaction type.

Open feedbackFinal focus

[index.tsx](#focus-management:css-modules:index.tsx)[index.module.css](#focus-management:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
'use client';
import * as React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import styles from './index.module.css';

export default function ExampleDialog() {
  const initialFocusRef = React.useRef<HTMLInputElement | null>(null);
  const finalFocusRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <div className={styles.Container}>
      <Dialog.Root>
        <Dialog.Trigger className={styles.Button}>Open feedback</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.Backdrop} />
          <Dialog.Popup
            className={styles.Popup}
            initialFocus={initialFocusRef}
            finalFocus={finalFocusRef}
          >
            <div className={styles.Intro}>
              <Dialog.Title className={styles.Title}>Feedback form</Dialog.Title>
              <Dialog.Description className={styles.Description}>
                Your feedback means a lot to us.
              </Dialog.Description>
            </div>
            <Fieldset.Root className={styles.Fieldset}>
              <Field.Root className={styles.Field}>
                <Field.Label className={styles.Label}>Full name</Field.Label>
                <Field.Control placeholder="Enter your name" className={styles.Input} />
              </Field.Root>
              <Field.Root className={styles.Field}>
                <Field.Label className={styles.Label}>Feedback</Field.Label>
                <Field.Control
                  ref={initialFocusRef}
                  required
                  placeholder="Enter your feedback"
                  className={styles.Input}
                />
              </Field.Root>
            </Fieldset.Root>
            <div className={styles.Actions}>
              <Dialog.Close className={styles.Button}>Close</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <button ref={finalFocusRef} type="button" className={styles.Button}>
        Final focus
      </button>
    </div>
  );
}
```

Show code

### [Outside scroll dialog](#outside-scroll-dialog)

The dialog can be made scrollable by using `<Dialog.Viewport>` as an outer scrollable container for `<Dialog.Popup>` while the popup can extend past the bottom edge. The scrollable area uses the [Scroll Area component](/react/components/scroll-area) to provide custom scrollbars.

Open dialog

[index.tsx](#outside-scroll:css-modules:index.tsx)[index.module.css](#outside-scroll:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
'use client';
import * as React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ScrollArea } from '@base-ui/react/scroll-area';
import styles from './index.module.css';

export default function OutsideScrollDialog() {
  const popupRef = React.useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.Button}>Open dialog</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.Backdrop} />
        <Dialog.Viewport className={styles.Viewport}>
          <ScrollArea.Root style={{ position: undefined }} className={styles.ScrollViewport}>
            <ScrollArea.Viewport className={styles.ScrollViewport}>
              <ScrollArea.Content className={styles.ScrollContent}>
                <Dialog.Popup ref={popupRef} className={styles.Popup} initialFocus={popupRef}>
                  <div className={styles.PopupHeader}>
                    <Dialog.Title className={styles.Title}>Dialog</Dialog.Title>
                    <Dialog.Description className={styles.Description}>
                      This layout keeps an outer container scrollable while the dialog can extend
                      past the bottom edge.
                    </Dialog.Description>
                    <Dialog.Close className={styles.Close} aria-label="Close">
                      <XIcon />
                    </Dialog.Close>
                  </div>

                  <div className={styles.Body}>
                    {CONTENT_SECTIONS.map((item) => (
                      <section className={styles.Section} key={item.title}>
                        <h3 className={styles.SectionTitle}>{item.title}</h3>
                        <p className={styles.SectionBody}>{item.body}</p>
                      </section>
                    ))}
                  </div>

                  <p className={styles.FooterNote}>
                    Related docs:{' '}
                    {RELATED_LINKS.map((item, index) => (
                      <React.Fragment key={item.href}>
                        {index > 0 ? ', ' : null}
                        <a className={styles.FooterLink} href={item.href}>
                          {item.label}
                        </a>
                      </React.Fragment>
                    ))}
                    .
                  </p>
                </Dialog.Popup>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className={styles.Scrollbar}>
              <ScrollArea.Thumb className={styles.ScrollbarThumb} />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function XIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="round"
      {...props}
      style={{ display: 'block', ...props.style }}
    >
      <path d="m2.5 2.5 11 11m-11 0 11-11" />
    </svg>
  );
}

const CONTENT_SECTIONS = [
  {
    title: 'What a dialog is for',
    body: 'Use a dialog when you need the user to complete a focused task or read something important without navigating away. It opens on top of the page and returns focus back where it started when closed.',
  },
  {
    title: 'Anatomy at a glance',
    body: 'Root, Trigger, Portal, Backdrop, Viewport, Popup, Title, Description, Close. Keep the title short and the first paragraph specific so screen readers announce something meaningful.',
  },
  {
    title: 'Opening and closing',
    body: 'Control it using external state via the `open` and `onOpenChange` props, or let it manage state for you internally.',
  },
  {
    title: 'Keyboard and focus behavior',
    body: 'Focus moves inside the dialog when it opens. Tab and Shift+Tab loop within, and Esc requests close.',
  },
  {
    title: 'Accessible labeling',
    body: 'Set an explicit title and description using the `Dialog.Title` and `Dialog.Description` components.',
  },
  {
    title: 'Backdrop and page scrolling',
    body: 'The backdrop visually separates layers while background content is inert. Don’t rely on dimness alone—keep copy clear and buttons obvious so actions are easy to choose.',
  },
  {
    title: 'Portals and stacking',
    body: 'Dialogs render in a portal so they sit above the `isolation: isolate` app content and avoid local z-index wars.',
  },
  {
    title: 'Viewport overflow',
    body: 'Let long content overflow the bottom edge and reveal as you scroll the page container. Keep generous padding at the top and bottom so the dialog doesn’t feel jammed against the edges.',
  },
  {
    title: 'Nested dialogs and confirmations',
    body: 'If closing a dialog needs confirmation, open a child alert dialog rather than mutating the current one. The parent stays visible behind it; only the topmost layer should feel interactive.',
  },
  {
    title: 'Transitions that respect motion settings',
    body: 'Use small, fast transitions (opacity plus a few pixels of Y translation or scale). Subtle motion helps people notice what changed without slowing them down.',
  },
  {
    title: 'Controlled vs. uncontrolled',
    body: 'Controlled state is best when other parts of the page need to react to open/close. Uncontrolled is fine for local cases where only the dialog matters.',
  },
  {
    title: 'Close affordances',
    body: 'Always offer a visible close button in the corner. Don’t rely only on Esc or the backdrop for pointer outside presses. Touch screen readers and accessibility users benefit from a clear, targetable control to click to close the dialog.',
  },
  {
    title: 'Forms inside dialogs',
    body: 'Keep forms short; longer flows usually deserve a full page. Validate inline, keep button text specific (“Create project”), and disable destructive actions until the input is valid.',
  },
  {
    title: 'Content guidelines',
    body: 'Lead with the outcome (“Rename project?”) and follow with one or two short, concrete sentences. Avoid long prose; link out for details instead.',
  },
  {
    title: 'SSR and hydration notes',
    body: 'Because dialogs render in a portal, make sure your portal container exists on the client.',
  },
  {
    title: 'Mobile ergonomics',
    body: 'Use larger touch targets and keep the close button reachable with the thumb. Avoid full-screen modals unless the task truly needs a whole screen.',
  },
  {
    title: 'Theming and density',
    body: 'Match spacing and corner radius to your system. Use a slightly denser layout than pages so the dialog feels purpose-built, not like a mini web page.',
  },
  {
    title: 'Internationalization',
    body: 'Plan for longer text. Buttons can grow to two lines; titles should wrap gracefully. Keep destructive terms consistent across locales.',
  },
  {
    title: 'Performance',
    body: 'Children are mounted lazily when the dialog opens. If the dialog can reopen often, consider the `keepMounted` prop sparingly to perform the work only once on mount to avoid re-initializing complex React trees on each open.',
  },
  {
    title: 'When a popover is better',
    body: 'If the content is a small hint or a few quick actions anchored to a control, use a popover or menu instead of a dialog. Dialogs interrupt on purpose—use that sparingly.',
  },
  {
    title: 'Follow-up and cleanup',
    body: 'After a successful action, close the dialog and show confirmation in context (toast, inline message, or updated UI) so people can see the result of what they just did.',
  },
];

const RELATED_LINKS = [
  { href: '/react/components/scroll-area', label: 'Scroll Area' },
  { href: '/react/components/drawer', label: 'Drawer' },
  { href: '/react/components/popover', label: 'Popover' },
] as const;
```

Show code

### [Inside scroll dialog](#inside-scroll-dialog)

The dialog can be made scrollable by making an inner container scrollable while the popup stays fully on screen. `<Dialog.Viewport>` is used as a positioning container for `<Dialog.Popup>`, while an inner scrollable area is created using the [Scroll Area component](/react/components/scroll-area).

Open dialog

[index.tsx](#inside-scroll:css-modules:index.tsx)[index.module.css](#inside-scroll:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import * as React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ScrollArea } from '@base-ui/react/scroll-area';
import styles from './index.module.css';

export default function InsideScrollDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.Button}>Open dialog</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.Backdrop} />
        <Dialog.Viewport className={styles.Viewport}>
          <Dialog.Popup className={styles.Popup}>
            <div className={styles.Header}>
              <Dialog.Title className={styles.Title}>Dialog</Dialog.Title>
              <Dialog.Description className={styles.Description}>
                This layout keeps the popup fully on screen while allowing its content to scroll.
              </Dialog.Description>
            </div>
            <ScrollArea.Root className={styles.Body}>
              <ScrollArea.Viewport className={styles.BodyViewport}>
                <ScrollArea.Content className={styles.BodyContent}>
                  {CONTENT_SECTIONS.map((item) => (
                    <section className={styles.Section} key={item.title}>
                      <h3 className={styles.SectionTitle}>{item.title}</h3>
                      <p className={styles.SectionBody}>{item.body}</p>
                    </section>
                  ))}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className={styles.Scrollbar}>
                <ScrollArea.Thumb className={styles.ScrollbarThumb} />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            <div className={styles.Actions}>
              <Dialog.Close className={styles.Button}>Close</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const CONTENT_SECTIONS = [
  {
    title: 'What a dialog is for',
    body: 'Use a dialog when you need the user to complete a focused task or read something important without navigating away. It opens on top of the page and returns focus back where it started when closed.',
  },
  {
    title: 'Anatomy at a glance',
    body: 'Root, Trigger, Portal, Backdrop, Popup, Title/Description, Close. Keep the title short and the first paragraph specific so screen readers announce something meaningful.',
  },
  {
    title: 'Opening and closing',
    body: 'Control it using external state via the `open` and `onOpenChange` props, or let it manage state for you internally.',
  },
  {
    title: 'Keyboard and focus behavior',
    body: 'Focus moves inside the dialog when it opens. Tab and Shift+Tab loop within, and Esc requests close.',
  },
  {
    title: 'Accessible labeling',
    body: 'Set an explicit title and description using the `Dialog.Title` and `Dialog.Description` components.',
  },
  {
    title: 'Backdrop and page scrolling',
    body: 'The backdrop visually separates layers while background content is inert. Don’t rely on dimness alone—keep copy clear and buttons obvious so actions are easy to choose.',
  },
  {
    title: 'Portals and stacking',
    body: 'Dialogs render in a portal so they sit above the `isolation: isolate` app content and avoid local z-index wars.',
  },
  {
    title: 'Viewport overflow',
    body: 'Let long content overflow the bottom edge and reveal as you scroll the page container. Keep generous padding at the top and bottom so the dialog doesn’t feel jammed against the edges.',
  },
  {
    title: 'Nested dialogs and confirmations',
    body: 'If closing a dialog needs confirmation, open a child alert dialog rather than mutating the current one. The parent stays visible behind it; only the topmost layer should feel interactive.',
  },
  {
    title: 'Transitions that respect motion settings',
    body: 'Use small, fast transitions (opacity plus a few pixels of Y translation or scale). Subtle motion helps people notice what changed without slowing them down.',
  },
  {
    title: 'Controlled vs. uncontrolled',
    body: 'Controlled state is best when other parts of the page need to react to open/close. Uncontrolled is fine for local cases where only the dialog matters.',
  },
  {
    title: 'Close affordances',
    body: 'Always offer a visible close button in the corner. Don’t rely only on Esc or the backdrop for pointer outside presses. Touch screen readers and accessibility users benefit from a clear, targetable control to click to close the dialog.',
  },
  {
    title: 'Forms inside dialogs',
    body: 'Keep forms short; longer flows usually deserve a full page. Validate inline, keep button text specific (“Create project”), and disable destructive actions until the input is valid.',
  },
  {
    title: 'Content guidelines',
    body: 'Lead with the outcome (“Rename project?”) and follow with one or two short, concrete sentences. Avoid long prose; link out for details instead.',
  },
  {
    title: 'SSR and hydration notes',
    body: 'Because dialogs render in a portal, make sure your portal container exists on the client.',
  },
  {
    title: 'Mobile ergonomics',
    body: 'Use larger touch targets and keep the close button reachable with the thumb. Avoid full-screen modals unless the task truly needs a whole screen.',
  },
  {
    title: 'Theming and density',
    body: 'Match spacing and corner radius to your system. Use a slightly denser layout than pages so the dialog feels purpose-built, not like a mini web page.',
  },
  {
    title: 'Internationalization',
    body: 'Plan for longer text. Buttons can grow to two lines; titles should wrap gracefully. Keep destructive terms consistent across locales.',
  },
  {
    title: 'Performance',
    body: 'Children are mounted lazily when the dialog opens. If the dialog can reopen often, consider the `keepMounted` prop sparingly to perform the work only once on mount to avoid re-initializing complex React trees on each open.',
  },
  {
    title: 'When a popover is better',
    body: 'If the content is a small hint or a few quick actions anchored to a control, use a popover or menu instead of a dialog. Dialogs interrupt on purpose—use that sparingly.',
  },
  {
    title: 'Follow-up and cleanup',
    body: 'After a successful action, close the dialog and show confirmation in context (toast, inline message, or updated UI) so people can see the result of what they just did.',
  },
];
```

Show code

### [Placing elements outside the popup](#placing-elements-outside-the-popup)

When adding elements that should appear “outside” the colored popup area, continue to place them inside `<Dialog.Popup>`, but create a child element that has the popup styles. This ensures they are kept in the tab order and announced correctly by screen readers.

`<Dialog.Popup>` has `pointer-events: none`, while inner content (the colored popup and close button) has `pointer-events: auto` so clicks on the backdrop continue to be registered.

Open dialog

[index.tsx](#uncontained:css-modules:index.tsx)[index.module.css](#uncontained:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
import { Dialog } from '@base-ui/react/dialog';
import styles from './index.module.css';

export default function ExampleUncontainedDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.Button}>Open dialog</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.Backdrop} />
        <Dialog.Viewport className={styles.Viewport}>
          <Dialog.Popup className={styles.PopupRoot}>
            <Dialog.Close className={styles.Close} aria-label="Close">
              <XIcon />
            </Dialog.Close>
            <div className={styles.Popup} />
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function XIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="round"
      {...props}
      style={{ display: 'block', ...props.style }}
    >
      <path d="m2.5 2.5 11 11m-11 0 11-11" />
    </svg>
  );
}
```

Show code

### [Detached triggers](#detached-triggers)

A dialog can be controlled by a trigger located either inside or outside the `<Dialog.Root>` component.
For simple, one-off interactions, place the `<Dialog.Trigger>` inside `<Dialog.Root>`, as shown in the example at the top of this page.

However, if defining the dialog’s content next to its trigger is not practical, you can use a detached trigger.
This involves placing the `<Dialog.Trigger>` outside of `<Dialog.Root>` and linking them with a `handle` created by the `Dialog.createHandle()` function.

The imperative methods on the handle, such as `open()` and `openWithPayload()`, require a `<Dialog.Root>` using the same handle to be mounted.
Calls made while no root is attached to the handle — before one mounts, or after it unmounts — are ignored. Each time a root mounts, it starts from fresh state: a call made while no root was attached is not replayed, and no open state carries over from a previous mount.

Detached triggers

```
const demoDialog = Dialog.createHandle();

<Dialog.Trigger handle={demoDialog}>Open</Dialog.Trigger>

<Dialog.Root handle={demoDialog}>
  ...
</Dialog.Root>
```

View notifications

[index.tsx](#detached-triggers-simple:css-modules:index.tsx)[index.module.css](#detached-triggers-simple:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
'use client';
import * as React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import styles from './index.module.css';

const demoDialog = Dialog.createHandle();

export default function DialogDetachedTriggersSimpleDemo() {
  return (
    <React.Fragment>
      <Dialog.Trigger className={styles.Button} handle={demoDialog}>
        View notifications
      </Dialog.Trigger>

      <Dialog.Root handle={demoDialog}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.Backdrop} />
          <Dialog.Popup className={styles.Popup}>
            <div className={styles.Intro}>
              <Dialog.Title className={styles.Title}>Notifications</Dialog.Title>
              <Dialog.Description className={styles.Description}>
                You are all caught up. Good job!
              </Dialog.Description>
            </div>
            <div className={styles.Actions}>
              <Dialog.Close className={styles.Button}>Close</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </React.Fragment>
  );
}
```

Show code

### [Multiple triggers](#multiple-triggers)

A single dialog can be opened by multiple trigger elements.
You can achieve this by using the same `handle` for several detached triggers, or by placing multiple `<Dialog.Trigger>` components inside a single `<Dialog.Root>`.

Multiple triggers within the Root part

```
<Dialog.Root>
  <Dialog.Trigger>Trigger 1</Dialog.Trigger>
  <Dialog.Trigger>Trigger 2</Dialog.Trigger>
  ...
</Dialog.Root>
```

Multiple detached triggers

```
const demoDialog = Dialog.createHandle();

<Dialog.Trigger handle={demoDialog}>Trigger 1</Dialog.Trigger>
<Dialog.Trigger handle={demoDialog}>Trigger 2</Dialog.Trigger>
<Dialog.Root handle={demoDialog}>
  ...
</Dialog.Root>
```

The dialog can render different content depending on which trigger opened it.
This is achieved by passing a `payload` to the `<Dialog.Trigger>` and using the function-as-a-child pattern in `<Dialog.Root>`.

The payload can be strongly typed by providing a type argument to the `createHandle()` function:

Detached triggers with payload

```
const demoDialog = Dialog.createHandle<{ text: string }>();

<Dialog.Trigger handle={demoDialog} payload={{ text: 'Trigger 1' }}>
  Trigger 1
</Dialog.Trigger>

<Dialog.Trigger handle={demoDialog} payload={{ text: 'Trigger 2' }}>
  Trigger 2
</Dialog.Trigger>

<Dialog.Root handle={demoDialog}>
  {({ payload }) => (
    <Dialog.Portal>
      <Dialog.Popup>
        <Dialog.Title>Dialog</Dialog.Title>
        {payload !== undefined && (
          <Dialog.Description>
            This has been opened by {payload.text}
          </Dialog.Description>
        )}
      </Dialog.Popup>
    </Dialog.Portal>
  )}
</Dialog.Root>
```

### [Controlled mode with multiple triggers](#controlled-mode-with-multiple-triggers)

You can control the dialog’s open state externally using the `open` and `onOpenChange` props on `<Dialog.Root>`.
This allows you to manage the dialog’s visibility based on your application’s state.
When using multiple triggers, you have to manage which trigger is active with the `triggerId` prop on `<Dialog.Root>` and the `id` prop on each `<Dialog.Trigger>`.

Note that there is no separate `onTriggerIdChange` prop.
Instead, the `onOpenChange` callback receives an additional argument, `eventDetails`, which contains the trigger element that initiated the state change.

Open 1Open 2Open 3Open programmatically

[index.tsx](#detached-triggers-controlled:css-modules:index.tsx)[index.module.css](#detached-triggers-controlled:css-modules:index.module.css)

CSS ModulesStackBlitz

CSS ModulesStackBlitz

```
'use client';
import * as React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import styles from './index.module.css';

const demoDialog = Dialog.createHandle<number>();

export default function DialogDetachedTriggersControlledDemo() {
  const [open, setOpen] = React.useState(false);
  const [triggerId, setTriggerId] = React.useState<string | null>(null);

  const handleOpenChange = (isOpen: boolean, eventDetails: Dialog.Root.ChangeEventDetails) => {
    setOpen(isOpen);
    setTriggerId(eventDetails.trigger?.id ?? null);
  };

  return (
    <React.Fragment>
      <div className={styles.Container}>
        <Dialog.Trigger className={styles.Button} handle={demoDialog} id="trigger-1" payload={1}>
          Open 1
        </Dialog.Trigger>

        <Dialog.Trigger className={styles.Button} handle={demoDialog} id="trigger-2" payload={2}>
          Open 2
        </Dialog.Trigger>

        <Dialog.Trigger className={styles.Button} handle={demoDialog} id="trigger-3" payload={3}>
          Open 3
        </Dialog.Trigger>

        <button
          className={styles.Button}
          type="button"
          onClick={() => {
            setTriggerId('trigger-2');
            setOpen(true);
          }}
        >
          Open programmatically
        </button>
      </div>

      <Dialog.Root
        handle={demoDialog}
        open={open}
        onOpenChange={handleOpenChange}
        triggerId={triggerId}
      >
        {({ payload }) => (
          <Dialog.Portal>
            <Dialog.Backdrop className={styles.Backdrop} />
            <Dialog.Popup className={styles.Popup}>
              {payload !== undefined && (
                <Dialog.Title className={styles.Title}>Dialog {payload}</Dialog.Title>
              )}
              <div className={styles.Actions}>
                <Dialog.Close className={styles.Button}>Close</Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </React.Fragment>
  );
}
```

Show code

## [API reference](#api-reference)

### [Root](#root)

Groups all parts of the dialog.
Doesn’t render its own HTML element.

Component props table

Prop

Type

Default

`defaultOpen``boolean``false`

Name
:   [`defaultOpen`](#DialogRoot-defaultOpen)

Description
:   Whether the dialog is initially open.

    To render a controlled dialog, use the `open` prop instead.

Type
:   ```
    boolean | undefined
    ```

Default
:   `false`

`open``boolean``—`

Name
:   [`open`](#DialogRoot-open)

Description
:   Whether the dialog is currently open.

Type
:   ```
    boolean | undefined
    ```

`onOpenChange``function``—`

Name
:   [`onOpenChange`](#DialogRoot-onOpenChange)

Description
:   Event handler called when the dialog is opened or closed.

Type
:   ```
    | ((
        open: boolean,
        eventDetails: Dialog.Root.ChangeEventDetails,
      ) => void)
    | undefined
    ```

`actionsRef``React.RefObject<Dialog.Root.Actions | null>``—`

Name
:   [`actionsRef`](#DialogRoot-actionsRef)

Description
:   A ref to imperative actions.

    * `unmount`: Manually unmounts the dialog.
      Call this after any externally controlled closing animation finishes.
    * `close`: Closes the dialog imperatively when called.

Type
:   ```
    React.RefObject<Dialog.Root.Actions | null> | undefined
    ```

`defaultTriggerId``string | null``—`

Name
:   [`defaultTriggerId`](#DialogRoot-defaultTriggerId)

Description
:   ID of the trigger that the dialog is associated with.
    This is useful in conjunction with the `defaultOpen` prop to create an initially open dialog.

Type
:   ```
    string | null | undefined
    ```

`disablePointerDismissal``boolean``false`

Name
:   [`disablePointerDismissal`](#DialogRoot-disablePointerDismissal)

Description
:   Whether to prevent the dialog from closing on outside presses.
    For non-modal dialogs, this also prevents the dialog from closing when focus moves outside of it.

Type
:   ```
    boolean | undefined
    ```

Default
:   `false`

`handle``Dialog.Handle<Payload>``—`

Name
:   [`handle`](#DialogRoot-handle)

Description
:   A handle to associate the dialog with a trigger.
    If specified, allows external triggers to control the dialog’s open state.
    Can be created with the Dialog.createHandle() method.

Type
:   ```
    Dialog.Handle<Payload> | undefined
    ```

`modal``boolean | 'trap-focus'``true`

Name
:   [`modal`](#DialogRoot-modal)

Description
:   Determines if the dialog enters a modal state when open.

    * `true`: user interaction is limited to just the dialog: focus is trapped, document page scroll is locked, and pointer interactions on outside elements are disabled.
    * `false`: user interaction with the rest of the document is allowed.
    * `'trap-focus'`: focus is trapped inside the dialog, but document page scroll is not locked and pointer interactions outside of it remain enabled.

    When `modal` is `true` or `'trap-focus'`, render `<[Dialog.Close](#close)>` inside `<[Dialog.Popup](#popup)>` so
    touch screen readers can escape the popup.

Type
:   ```
    boolean | 'trap-focus' | undefined
    ```

Default
:   `true`

`onOpenChangeComplete``function``—`

Name
:   [`onOpenChangeComplete`](#DialogRoot-onOpenChangeComplete)

Description
:   Event handler called after any animations complete when the dialog is opened or closed.

Type
:   ```
    ((open: boolean) => void) | undefined
    ```

`triggerId``string | null``—`

Name
:   [`triggerId`](#DialogRoot-triggerId)

Description
:   ID of the trigger that the dialog is associated with.
    This is useful in conjunction with the `open` prop to create a controlled dialog.
    There’s no need to specify this prop when the dialog is uncontrolled (that is, when the `open` prop is not set).

Type
:   ```
    string | null | undefined
    ```

`children``| React.ReactNode
|  PayloadChildRenderFunction<Payload>``—`

Name
:   [`children`](#DialogRoot-children)

Description
:   The content of the dialog.
    This can be a regular React node or a render function that receives the `payload` of the active trigger.

Type
:   ```
    React.ReactNode | ((arg: { payload: unknown | undefined }) => ReactNode)<Payload> | undefined
    ```

### Dialog.Root.PropsHide

Re-Export of [Root](#root) props as `DialogRootProps`

### Dialog.Root.StateHide

```
type DialogRootState = {}
```

### Dialog.Root.ActionsHide

```
type DialogRootActions = { unmount: () => void; close: () => void }
```

### Dialog.Root.ChangeEventReasonHide

```
type DialogRootChangeEventReason =
  | 'trigger-press'
  | 'outside-press'
  | 'escape-key'
  | 'close-press'
  | 'focus-out'
  | 'imperative-action'
  | 'none'
```

### Dialog.Root.ChangeEventDetailsHide

```
type DialogRootChangeEventDetails = (
  | { reason: 'trigger-press'; event: KeyboardEvent | MouseEvent | TouchEvent | PointerEvent }
  | { reason: 'outside-press'; event: MouseEvent | TouchEvent | PointerEvent }
  | { reason: 'escape-key'; event: KeyboardEvent }
  | { reason: 'close-press'; event: KeyboardEvent | MouseEvent | PointerEvent }
  | { reason: 'focus-out'; event: FocusEvent | KeyboardEvent }
  | { reason: 'imperative-action'; event: Event }
  | { reason: 'none'; event: Event }
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
  preventUnmountOnClose: (() => void);
}
```

### [Trigger](#trigger)

A button that opens the dialog.
Renders a `<button>` element.

Component props table

Prop

Type

Default

`handle``Dialog.Handle<Payload>``—`

Name
:   [`handle`](#DialogTrigger-handle)

Description
:   A handle to associate the trigger with a dialog.
    Can be created with the Dialog.createHandle() method.

Type
:   ```
    Dialog.Handle<Payload> | undefined
    ```

`nativeButton``boolean``true`

Name
:   [`nativeButton`](#DialogTrigger-nativeButton)

Description
:   Whether the component renders a native `<button>` element when replacing it
    via the `render` prop.
    Set to `false` if the rendered element is not a button (for example, `<div>`).

Type
:   ```
    boolean | undefined
    ```

Default
:   `true`

`payload``Payload``—`

Name
:   [`payload`](#DialogTrigger-payload)

Description
:   A payload to pass to the dialog when it is opened.

Type
:   ```
    Payload | undefined
    ```

`id``string``—`

Name
:   [`id`](#DialogTrigger-id)

Description
:   ID of the trigger. In addition to being forwarded to the rendered element,
    it is also used to specify the active trigger for the dialog in controlled mode (with the Dialog.Root `triggerId` prop).

Type
:   ```
    string | undefined
    ```

`className``string | function``—`

Name
:   [`className`](#DialogTrigger-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Dialog.Trigger.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogTrigger-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Trigger.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#DialogTrigger-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Trigger.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-popup-open`

Present when the corresponding dialog is open.

`data-disabled`

Present when the trigger is disabled.

| Attribute | Description | - |
| --- | --- | --- |
| `data-popup-open` | Present when the corresponding dialog is open. | |
| `data-disabled` | Present when the trigger is disabled. | |

### Dialog.Trigger.PropsHide

Re-Export of [Trigger](#trigger) props as `DialogTriggerProps`

### Dialog.Trigger.StateHide

```
type DialogTriggerState = {
  /** Whether the trigger is currently disabled. */
  disabled: boolean;
  /** Whether the dialog is currently open and was opened by this trigger. */
  open: boolean;
}
```

### [Portal](#portal)

A portal element that moves the popup to a different part of the DOM.
By default, the portal element is appended to `<body>`.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`container``Union``—`

Name
:   [`container`](#DialogPortal-container)

Description
:   A parent element to render the portal element into.

Type
:   ```
    | HTMLElement
    | ShadowRoot
    | React.RefObject<HTMLElement | ShadowRoot | null>
    | null
    | undefined
    ```

`className``string | function``—`

Name
:   [`className`](#DialogPortal-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Dialog.Portal.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogPortal-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Portal.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`keepMounted``boolean``false`

Name
:   [`keepMounted`](#DialogPortal-keepMounted)

Description
:   Whether to keep the portal mounted in the DOM while the popup is hidden.

Type
:   ```
    boolean | undefined
    ```

Default
:   `false`

`render``ReactElement | function``—`

Name
:   [`render`](#DialogPortal-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Portal.State,
      ) => ReactElement)
    | undefined
    ```

### Dialog.Portal.PropsHide

Re-Export of [Portal](#portal) props as `DialogPortalProps`

### Dialog.Portal.StateHide

```
type DialogPortalState = {}
```

### [Backdrop](#backdrop)

An overlay displayed beneath the popup.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`forceRender``boolean``false`

Name
:   [`forceRender`](#DialogBackdrop-forceRender)

Description
:   Whether the backdrop is forced to render even when nested.

Type
:   ```
    boolean | undefined
    ```

Default
:   `false`

`className``string | function``—`

Name
:   [`className`](#DialogBackdrop-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Dialog.Backdrop.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogBackdrop-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Backdrop.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#DialogBackdrop-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Backdrop.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-open`

Present when the dialog is open.

`data-closed`

Present when the dialog is closed.

`data-starting-style`

Present when the dialog begins animating in.

`data-ending-style`

Present when the dialog is animating out.

| Attribute | Description | - |
| --- | --- | --- |
| `data-open` | Present when the dialog is open. | |
| `data-closed` | Present when the dialog is closed. | |
| `data-starting-style` | Present when the dialog begins animating in. | |
| `data-ending-style` | Present when the dialog is animating out. | |

### Dialog.Backdrop.PropsHide

Re-Export of [Backdrop](#backdrop) props as `DialogBackdropProps`

### Dialog.Backdrop.StateHide

```
type DialogBackdropState = {
  /** Whether the dialog is currently open. */
  open: boolean;
  /** The transition status of the component. */
  transitionStatus: TransitionStatus;
}
```

### [Viewport](#viewport)

A positioning container for the dialog popup that can be made scrollable.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`className``string | function``—`

Name
:   [`className`](#DialogViewport-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Dialog.Viewport.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogViewport-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Viewport.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#DialogViewport-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Viewport.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-open`

Present when the dialog is open.

`data-closed`

Present when the dialog is closed.

`data-nested`

Present when the dialog is nested within another dialog.

`data-nested-dialog-open`

Present when the dialog has other open dialogs nested within it.

`data-starting-style`

Present when the dialog begins animating in.

`data-ending-style`

Present when the dialog is animating out.

| Attribute | Description | - |
| --- | --- | --- |
| `data-open` | Present when the dialog is open. | |
| `data-closed` | Present when the dialog is closed. | |
| `data-nested` | Present when the dialog is nested within another dialog. | |
| `data-nested-dialog-open` | Present when the dialog has other open dialogs nested within it. | |
| `data-starting-style` | Present when the dialog begins animating in. | |
| `data-ending-style` | Present when the dialog is animating out. | |

### Dialog.Viewport.PropsHide

Re-Export of [Viewport](#viewport) props as `DialogViewportProps`

### Dialog.Viewport.StateHide

```
type DialogViewportState = {
  /** Whether the dialog is currently open. */
  open: boolean;
  /** The transition status of the component. */
  transitionStatus: TransitionStatus;
  /** Whether the dialog is nested within another dialog. */
  nested: boolean;
  /** Whether the dialog has nested dialogs open. */
  nestedDialogOpen: boolean;
}
```

### [Popup](#popup)

A container for the dialog contents.
Renders a `<div>` element.

Component props table

Prop

Type

Default

`initialFocus``Union``—`

Name
:   [`initialFocus`](#DialogPopup-initialFocus)

Description
:   Determines the element to focus when the dialog is opened.
    By default, focus moves to the first tabbable element inside the popup, except when the dialog
    is opened by touch — then the popup itself is focused to avoid opening the virtual keyboard.

    * `false`: Do not move focus.
    * `true`: Move focus based on the default behavior (first tabbable element or popup).
    * `RefObject`: Move focus to the ref element.
    * `function`: Called with the interaction type (`mouse`, `touch`, `pen`, or `keyboard`).
      Return an element to focus, `true` to use the default behavior, `null` to fall back to the default behavior, or `false`/`undefined` to do nothing.

Type
:   ```
    | boolean
    | React.RefObject<HTMLElement | null>
    | ((
        openType: 'mouse' | 'touch' | 'pen' | 'keyboard' | '',
      ) => boolean | void | HTMLElement | null)
    | undefined
    ```

`finalFocus``Union``—`

Name
:   [`finalFocus`](#DialogPopup-finalFocus)

Description
:   Determines the element to focus when the dialog is closed.

    * `false`: Do not move focus.
    * `true`: Move focus based on the default behavior (trigger or previously focused element).
    * `RefObject`: Move focus to the ref element.
    * `function`: Called with the interaction type (`mouse`, `touch`, `pen`, or `keyboard`).
      Return an element to focus, `true` to use the default behavior, `null` to fall back to the default behavior, or `false`/`undefined` to do nothing.

Type
:   ```
    | boolean
    | React.RefObject<HTMLElement | null>
    | ((
        closeType:
          'mouse' | 'touch' | 'pen' | 'keyboard' | '',
      ) => boolean | void | HTMLElement | null)
    | undefined
    ```

`className``string | function``—`

Name
:   [`className`](#DialogPopup-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Dialog.Popup.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogPopup-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Popup.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#DialogPopup-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Popup.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-open`

Present when the dialog is open.

`data-closed`

Present when the dialog is closed.

`data-nested`

Present when the dialog is nested within another dialog.

`data-nested-dialog-open`

Present when the dialog has other open dialogs nested within it.

`data-starting-style`

Present when the dialog begins animating in.

`data-ending-style`

Present when the dialog is animating out.

| Attribute | Description | - |
| --- | --- | --- |
| `data-open` | Present when the dialog is open. | |
| `data-closed` | Present when the dialog is closed. | |
| `data-nested` | Present when the dialog is nested within another dialog. | |
| `data-nested-dialog-open` | Present when the dialog has other open dialogs nested within it. | |
| `data-starting-style` | Present when the dialog begins animating in. | |
| `data-ending-style` | Present when the dialog is animating out. | |

CSS Variable

`--nested-dialogs`

Indicates how many dialogs are nested within.

| CSS Variable | Description | - |
| --- | --- | --- |
| `--nested-dialogs` | Indicates how many dialogs are nested within. | |

### Dialog.Popup.PropsHide

Re-Export of [Popup](#popup) props as `DialogPopupProps`

### Dialog.Popup.StateHide

```
type DialogPopupState = {
  /** Whether the dialog is currently open. */
  open: boolean;
  /** The transition status of the component. */
  transitionStatus: TransitionStatus;
  /** Whether the dialog is nested within a parent dialog. */
  nested: boolean;
  /** Whether the dialog has nested dialogs open. */
  nestedDialogOpen: boolean;
}
```

### [Title](#title)

A heading that labels the dialog.
Renders an `<h2>` element.

Component props table

Prop

Type

Default

`className``string | function``—`

Name
:   [`className`](#DialogTitle-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Dialog.Title.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogTitle-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Title.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#DialogTitle-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Title.State,
      ) => ReactElement)
    | undefined
    ```

### Dialog.Title.PropsHide

Re-Export of [Title](#title) props as `DialogTitleProps`

### Dialog.Title.StateHide

```
type DialogTitleState = {}
```

### [Description](#description)

A paragraph with additional information about the dialog.
Renders a `<p>` element.

Component props table

Prop

Type

Default

`className``string | function``—`

Name
:   [`className`](#DialogDescription-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((
        state: Dialog.Description.State,
      ) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogDescription-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Description.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#DialogDescription-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Description.State,
      ) => ReactElement)
    | undefined
    ```

### Dialog.Description.PropsHide

Re-Export of [Description](#description) props as `DialogDescriptionProps`

### Dialog.Description.StateHide

```
type DialogDescriptionState = {}
```

### [Close](#close)

A button that closes the dialog.
Renders a `<button>` element.

Component props table

Prop

Type

Default

`nativeButton``boolean``true`

Name
:   [`nativeButton`](#DialogClose-nativeButton)

Description
:   Whether the component renders a native `<button>` element when replacing it
    via the `render` prop.
    Set to `false` if the rendered element is not a button (for example, `<div>`).

Type
:   ```
    boolean | undefined
    ```

Default
:   `true`

`className``string | function``—`

Name
:   [`className`](#DialogClose-className)

Description
:   CSS class applied to the element, or a function that
    returns a class based on the component’s state.

Type
:   ```
    | string
    | ((state: Dialog.Close.State) => string | undefined)
    | undefined
    ```

`style``React.CSSProperties | function``—`

Name
:   [`style`](#DialogClose-style)

Description
:   Style applied to the element, or a function that
    returns a style object based on the component’s state.

Type
:   ```
    | React.CSSProperties
    | ((
        state: Dialog.Close.State,
      ) => React.CSSProperties | undefined)
    | undefined
    ```

`render``ReactElement | function``—`

Name
:   [`render`](#DialogClose-render)

Description
:   Allows you to replace the component’s HTML element
    with a different tag, or compose it with another component.

    Accepts a `ReactElement` or a function that returns the element to render.

Type
:   ```
    | ReactElement
    | ((
        props: HTMLProps,
        state: Dialog.Close.State,
      ) => ReactElement)
    | undefined
    ```

Attribute

`data-disabled`

Present when the button is disabled.

| Attribute | Description | - |
| --- | --- | --- |
| `data-disabled` | Present when the button is disabled. | |

### Dialog.Close.PropsHide

Re-Export of [Close](#close) props as `DialogCloseProps`

### Dialog.Close.StateHide

```
type DialogCloseState = {
  /** Whether the button is currently disabled. */
  disabled: boolean;
}
```

## [createHandle](#createhandle)

Creates a new handle to connect a Dialog.Root with detached Dialog.Trigger components.

### Return value

```
Dialog.Handle<Payload>
```

### [Handle](#handle)

Controls a Dialog imperatively and associates detached `Dialog.Trigger` components with a
`Dialog.Root`. Create one with `Dialog.createHandle()` and pass it to the `handle` prop of the
root and of any triggers rendered outside of it.

The imperative methods take effect only while a root using this handle is mounted; calls made
before a root attaches (or after it unmounts) are ignored.

### Properties

Class properties table

Property

Type

Modifiers

`isOpen``boolean``readonly`

Name
:   [`isOpen`](#Dialog.Handle-isOpen)

Description
:   Whether the dialog is currently open. Returns `false` while no root is attached to the handle.

Type
:   ```
    boolean
    ```

Modifiers
:   `readonly`

### Methods

Class methods table

Method

Returns

`open(triggerId)``void`

Name
:   [`open`](#Dialog.Handle-open)

Description
:   Opens the dialog, optionally associating it with a trigger.

    This method should only be called in an event handler or an effect (not during rendering).

Parameters
:   * `triggerId`—

      ```
      string | null
      ```

      ID of the trigger to associate with the dialog. The trigger must be a matching
      `Dialog.Trigger` with this handle passed as a prop. Pass `null` to open without associating any trigger.

Returns
:   `void`

`openWithPayload(payload)``void`

Name
:   [`openWithPayload`](#Dialog.Handle-openWithPayload)

Description
:   Opens the dialog with the given payload, without associating it with any trigger.

    This method should only be called in an event handler or an effect (not during rendering).

Parameters
:   * `payload`—

      ```
      Payload
      ```

      Payload to set when opening the dialog. It is exposed to the root’s render-prop children.

Returns
:   `void`

`close()``void`

Name
:   [`close`](#Dialog.Handle-close)

Description
:   Closes the dialog.

    This method should only be called in an event handler or an effect (not during rendering).

Returns
:   `void`
