[###### Advisory boards aren’t only for executives. Join the LogRocket Content Advisory Board today →](https://lp.logrocket.com/blg/content-advisory-board-signup)

[![LogRocket blog logo](https://blog.logrocket.com/wp-content/themes/logrocket/assets/logrocket-logo.png)](https://logrocket.com)

[ ]

* [Blog](https://blog.logrocket.com/)
  + [Dev](https://blog.logrocket.com/dev)
  + [Product Management](https://blog.logrocket.com/product-management)
  + [UX Design](https://blog.logrocket.com/ux-design)
  + [Podcast](https://podrocket.logrocket.com)
  + [Product Leadership](https://stories.logrocket.com/)
* [Features](https://logrocket.com/features)
* Solutions
  + [Solve User-Reported Issues](https://logrocket.com/solutions/solve-user-issues)
  + [Surface User Struggle](https://logrocket.com/solutions/surface-user-struggle)
  + [Optimize Conversion and Adoption](https://logrocket.com/solutions/optimize-conversion-adoption)

* [Start Monitoring for Free](https://app.logrocket.com/)
* [Sign In](https://app.logrocket.com/)

2021-08-18

2152

#css

Idorenyin Udoh

63206

Aug 18, 2021 ⋅ 7 min read

# The Web Animations API vs. CSS

[![](https://blog.logrocket.com/wp-content/uploads/2021/08/unnamed-150x150.jpg)](https://blog.logrocket.com/author/idorenyinudoh/)

[Idorenyin Udoh](https://blog.logrocket.com/author/idorenyinudoh/)
Frontend developer and technical writer

![LogRocket Galileo logo](https://blog.logrocket.com/wp-content/uploads/2023/12/GalileoAIPreview.png)

Introducing Galileo AI

LogRocket’s Galileo AI watches every session, surfacing impactful user struggle and key behavior patterns.

[LEARN MORE](https://logrocket.com/products/galileo-ai)

![](https://blog.logrocket.com/wp-content/uploads/2023/04/logrocket-logo-1.png)

## See how LogRocket's Galileo AI surfaces the most severe issues for you

### No signup required

Check it out

Web animations are a popular addition to web design, leading to the growth of many JavaScript animation libraries including [Framer Motion](https://blog.logrocket.com/framer-motion-tutorial/) and [GreenSock](https://blog.logrocket.com/animating-vue-with-greensock/). However, many developers still choose to create web animations from scratch using either CSS transitions, CSS animations, or the JavaScript Web Animations API (WAAPI).

![Web Animations API CSS](https://blog.logrocket.com/wp-content/uploads/2021/08/8qXchtzX.png)

In this tutorial, we’ll cover these three methods in-depth, learning how to use each through a relevant demo. We’ll compare each method and discuss the many benefits that make the [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API) underrated in my opinion. Let’s get started!

## CSS transitions

CSS transitions allow us to seamlessly change a CSS property from one state to another. For example, let’s say that we want to change the value of an element’s `background-color` property from black to red. Naturally, the change would occur immediately, however, CSS transitions give us control over certain aspects of the process.

For example, we can decide when the change will start, what properties to animate, and how long the animation will run. To be animated, the property must be included in the list of [CSS animatable properties](https://blog.logrocket.com/css-reference-guide-transitions/).

### Properties

Let’s review the CSS properties that we need to create a CSS transition:

* `transition-property`: the CSS property that we’ll apply the transition on
* `transition-duration`: the length of time the transition should run
* `transition-delay`: how long to wait before the animation begins
* `transition-timing-function`: the speed of the transition

`transition-timing-function` is either linear, increasing in speed, or decreasing in speed. Typically, `transition-timing-function` is either a function that determines the value of the CSS property at intermediate points or a keyword that is an equivalent of the function.

You can use the `transition` shorthand property in place of the four properties described above:

```
.element {
  transition: <property> <duration> <timing-function> <delay>;
}
```

### Demo

Now, let’s see CSS transitions in action! In the following CodePen, when a user hovers on the display, the background color will change from black to red.

See the Pen  [css transitions test](https://codepen.io/idorenyinudoh/pen/PomdrEZ) by Udoh Idorenyin ([@idorenyinudoh](https://codepen.io/idorenyinudoh))
on [CodePen](https://codepen.io).

### Multiple animations

In the following demo, you’ll see how we can apply CSS transitions in multiple CSS properties by separating the values of the transition properties with commas:

See the Pen  [css transitions test 2](https://codepen.io/idorenyinudoh/pen/KKmxjBX) by Udoh Idorenyin ([@idorenyinudoh](https://codepen.io/idorenyinudoh))
on [CodePen](https://codepen.io).

Now that we’re familiar with CSS transitions, let’s take a look at CSS animations.

## CSS animations

CSS animations let us make our animations a little more interesting. We’ll need a `@keyframes` CSS at-rule, which specifies the CSS rules at the start of the animation, the end of the animation, and during the animation cycle. We’ll also need a rule that initializes the CSS animation.

### Properties

Let’s take a look at the properties we need to create a CSS animation:

* `animation-name`: the name of the `@keyframes` at-rule
* `animation-play-state`: specifies if an animation is `running` or `paused`
* `animation-direction`: specifies the animation’s direction
* `animation-iteration-count`: the number of cycles the animation will complete
* `animation-fill-mode`: how the animation applies styles to the element before and after execution

If `animation-iteration-count` is set to `infinite`, the animation will play continuously. If `animation-fill-mode` is set to `forward`, the element retains the styling in the last keyframe. If set to `backward`, the styling of the first keyframe is applied to the element before the animation begins.

`animation-delay` is the time between applying and playing the animation. It is similar to `transition-delay` in CSS transitions. `animation-duration` is the amount of time for the animation to complete one cycle. Its equivalent is `transition-duration`.

Lastly, `animation-timing-function` represents an animation’s progression through its cycle. Its equivalent is `transition-timing-function`. Like in CSS transitions, there is an `animation` shorthand for CSS animations that handles these properties:

```
.element {
  animation: <name> <duration> <timing-function> <delay> <iteration-count> <direction> <fill-mode>;
}
```

### Demo

To get an idea of how CSS animations work, let’s recreate the demo from above and change an object’s background color from black to red:

See the Pen  [css animations test](https://codepen.io/idorenyinudoh/pen/eYWMYrJ) by Udoh Idorenyin ([@idorenyinudoh](https://codepen.io/idorenyinudoh))
on [CodePen](https://codepen.io).

You may have noticed a few key differences from CSS transitions. For one, the animation starts immediately instead of being initialized by the user. CSS animation properties can utilize the `@keyframes` at-rule when it is available to run elements.

However, in CSS transitions, the rule that defines the end state of the animation has to be in a different declaration than the element’s default declaration. For this reason, we used the `:hover` pseudo-class in the first demo.

In CSS animations, the element immediately returns to its default styling when the animation is complete. On the other hand, CSS transitions run both ways by default.

For example, when our background changes from black to red, the animation runs, and vice versa. To implement this functionality with CSS animations, we’d need to define the animation again and set the `animation-direction` property to `reverse`.

---

[![](https://blog.logrocket.com/wp-content/uploads/2023/07/Screen-Shot-2023-07-06-at-7.44.15-AM.png)

## Over 200k developers use LogRocket to create better digital experiences

![](https://blog.logrocket.com/wp-content/uploads/2022/08/rocket-button-icon.png)Learn more →](https://lp.logrocket.com/blg/learn-more)

---

### Multiple animations

To create multiple animations using CSS animations, we can enter all of the properties we want to animate in one `@keyframes` at-rule and use it in an `animation` property, as seen in the following code snippet:

```
.element {
  animation: color-change 2s ease-in-out 1s infinite forwards;
}

@keyframes color-width-change {
  0% {
    background: black;
  }
  25% {
    width: 200px;
  }
  100% {
    background: red;
    width: 500px;
  }
}
```

Another approach is to use multiple `@keyframes` at-rules and separate the values of the animation properties with commas. The following approach is ideal if you want to use different values for the animation properties:

```
.element {
  animation: color-change 2s ease-in-out 1s infinite forwards, width-change 3s ease-in 0s infinite forwards;
}

@keyframes color-change {
  0% {
    background: black;
  }
  100% {
    background: red;
  }
}

@keyframes width-change {
  25% {
    width: 200px;
  }
  100% {
    width: 500px;
  }
}
```

The CodePen below contains a demo for the code snippet above:

See the Pen  [css animations test 2](https://codepen.io/idorenyinudoh/pen/WNjYBgm) by Udoh Idorenyin ([@idorenyinudoh](https://codepen.io/idorenyinudoh))
on [CodePen](https://codepen.io).

You’ll notice that the `width-change` animation is still running when the `color-change` animation is completed. To avoid repetition, you can exclude some properties from the shorthand and instead specify them in one value with the individual `animation-*` property.

## The Web Animations API

The JavaScript approach to animation, the Web Animations API, gives developers much more control and nuance over CSS animations. Although the Web Animations API may initially seem more complex when you’re setting it up, you can disassociate it from an element’s styling, making it easier to write and more straightforward than the CSS alternatives.

To animate a DOM element with the Web Animations API, we call the `animate()` method on the element. The `animate()` method has two parameters, keyframes and options. As with CSS transitions and CSS animations, the element has to be animatable.

### Keyframes

Keyframes could either be an array of keyframe objects or an object with an array of values as a property:

```
const keyframes = [
    { opacity: 1 },
    { opacity: 0 },
    { opacity: 1 }
]

// OR

const keyframes = {
    opacity: [ 1, 0, 1 ]
}
```

In the first method, the keyframe objects are distributed at even points through the animation cycle. For example, in the code block above, the points will be zero percent, 50 percent, and 100 percent by default. To change the points, set an `offset` property in the keyframe object with a value between `0.0` and `1.0`, with `0.5` being 50 percent.

Consider the following example in CSS:

```
@keyframes fade-in-out {
    0% {
        opacity: 0;
    }
    60% {
        opacity: 1;
    }
    100% {
        opacity: 0;
    }
}
```

Using the first keyframes method in the Web Animations API, the CSS code above would look like the following:

```
const keyframes = [
    { opacity: 1 },
    { opacity: 0, offset: 0.6 },
    { opacity: 1 }
]
```

If we were to use the second keyframes method and use an array of values as a property, our CSS code would look like the following:

```
const keyframes = {
  opacity: [0, 1, 0],
  offset: [0, 0.6, 1] //could also be [0, 0.6]
}
```

In CSS, you can use a timing function for an animation, however, with the Web Animations API, you can specify a timing function for each keyframe as well as for the entire animation.

Include the `easing` property for a keyframe in the same way you would include the `offset` property. The `easing` property will be applied from that keyframe to the next specified keyframe:

```
const keyframes = [
    { opacity: 1, easing: 'ease-in' },
    { opacity: 0, offset: 0.6, easing: 'ease-out' },
    { opacity: 1, easing: 'ease-in-out' }
]

// OR

const keyframes = {
    opacity: [ 1, 0, 1 ],
    offset: [0, 0.6],
    easing: ['ease-in', 'ease-out', 'ease-in-out']
}
```

To include the `easing` value in the entire animation, we’ll include it in the options object:

### `options`

`options` can be either an integer type that specifies the animation’s duration in milliseconds or an `EffectTiming` object that contains at least one equivalent to a CSS animation property. Let’s review the Web Animations API’s equivalents of these properties:

| CSS animation property | Web Animations API equivalent |
| --- | --- |
| `animation-name` | `id` |
| `animation-duration` | `duration` |
| `animation-timing-function` | `easing` |
| `animation-fill-mode` | `fill` |
| `animation-iteration-count` | `iterations` |
| `animation-direction` | `direction` |
| `animation-delay` | `delay` |

We’ll cover an equivalent for the `animation-play-state` CSS property shortly. However, there are several properties that you can include in the `options` object that do not have CSS equivalents:

`endDelay` specifies the length of the delay after the animation has ended, which is helpful when we wish to play back-to-back animations.

`iterationStart` specifies the point in an iteration when an animation should start, ranging from `0.0` to `1.0`. For example, a value of `0.3` would mean that the animation should start at the 30 percent keyframe point.

---

### More great articles from LogRocket:

* Don't miss a moment with [The Replay](https://lp.logrocket.com/subscribe-thereplay), a curated newsletter from LogRocket
* [Learn](https://blog.logrocket.com/rethinking-error-tracking-product-analytics/) how LogRocket's Galileo AI watches sessions for you and proactively surfaces the highest-impact things you should work on
* Use React's useEffect [to optimize your application's performance](https://blog.logrocket.com/understanding-react-useeffect-cleanup-function/)
* Switch between [multiple versions of Node](https://blog.logrocket.com/switching-between-node-versions-during-development/)
* [Discover](https://blog.logrocket.com/using-react-children-prop-with-typescript/)  how to use the React children prop with TypeScript
* [Explore](https://blog.logrocket.com/creating-custom-mouse-cursor-css/) creating a custom mouse cursor with CSS
* Advisory boards aren’t just for executives. [Join LogRocket’s Content Advisory Board.](https://lp.logrocket.com/blg/content-advisory-board-signup) You’ll help inform the type of content we create and get access to exclusive meetups, social accreditation, and swag

---

`composite` specifies how an animation’s values are combined with other animations that do not have the `composite` property. For instance, the value `add` would add the next animation to the previous animation. Naturally, the previous one would have been overwritten.

`iterationComposite` specifies how values are built from iteration to iteration in the animation.

### `animate()`

The `animate()` method returns an `Animation` object. Let’s consider the properties and methods made available by the object.

#### Properties

* `currentTime`: the current point of the animation in milliseconds
* `effect`: the `AnimationEffect` object, which is a `KeyframeEffect` object
* `finished`: returns a promise that resolves when the animation has ended
* `id`: the `id` used to identify the animation
* `pending`: the animation is waiting for an operation to complete
* `playbackRate`: the playback rate of the animation
* `ready`: returns a promise that resolves when the animation is ready to play
* `replaceState`: returns the replace state of the animation
* `startTime`: the time at which the animation is scheduled to begin
* `timeline`: the timeline associated with the animation
* `playState`: specifies whether the animation is playing or not

#### Methods

* `cancel()`: clears the `KeyframeEffect` created by the animation and ends its playback
* `finish()`: forwards to the end of the animation
* `pause()`: pauses the animation
* `persist()`: persists the animation to the element when the browser would have removed it
* `play()`: starts or resumes the animation
* `reverse()`: plays the animation from the end to the beginning
* `updatePlaybackRate()`: sets the animation’s speed after it has already started
* `commitStyles()`: commits the styling of the animation’s end state to the element

Other events for this object include `cancel`, `finish`, and `remove` events.

### Demo

Let’s recreate our animation from earlier using the properties, methods, and options of the Web Animations API. Our JavaScript file should look like the following code block:

```
const element = document.querySelector('div');

const keyframes = {
    background: [ 'black', 'red' ]
}

const options = {
    id: "color-change",
    duration: 2000,
    delay: 1000,
    easing: "ease-in-out",
    iterations: Infinity,
    fill: "forwards"
}

element.animate(keyframes, options);
```

To play an animation continuously, we use the JavaScript keyword `Infinity` as the value for the `iterations` property in the `options` object.

See the Pen  [web animations api test](https://codepen.io/idorenyinudoh/pen/wvdmXKz) by Udoh Idorenyin ([@idorenyinudoh](https://codepen.io/idorenyinudoh))
on [CodePen](https://codepen.io).

To create multiple animations, we can include multiple properties in one keyframes object. To use different values for properties in the `options` object, we could create multiple keyframes and `options` objects and use the `animate()` method multiple times on an element.

See the Pen  [web animations api test 2](https://codepen.io/idorenyinudoh/pen/bGWOEqg) by Udoh Idorenyin ([@idorenyinudoh](https://codepen.io/idorenyinudoh))
on [CodePen](https://codepen.io).

## Advantages of animating with WAAPI

Now that we understand how to animate using CSS transitions, CSS animations, and the Web Animations API, let’s note some key advantages of using the Web Animations API that are frequently overlooked.

For one, with CSS, we can only use one timing function for the entire animation. However, with the Web Animations API, we can specify `easing` properties for different keyframes and the entire animation in the `options` object.

With the Web Animations API, we can add several animations to an element using the `currentTime` and `startTime` properties of the `Animation` object and the `Animation` events. In CSS, you must either overwrite one animation with another, play all of them together, or add another animation to the same element using JavaScript.

The `composite` property on the `options` object in the Web Animations API allows us to indicate to the browser how we want successive animations to run on an element. CSS doesn’t have an equivalent.

## Conclusion

The properties, methods, and events in the Web Animations API make it easy to customize animations on the web. In my experience, non-complex animations are better implemented in CSS while more complex ones are better in JavaScript.

Admittedly, animating from scratch can get very difficult. You may want to consider third-party animation tools like [Flow](https://createwithflow.com), which can export animations into formats like the Web Animations API.

I hope you enjoyed this tutorial. Happy animating!

## Is your frontend hogging your users' CPU?

As web frontends get increasingly complex, resource-greedy features demand more and more from the browser. If you’re interested in monitoring and tracking client-side CPU usage, memory usage, and more for all of your users in production, [try LogRocket](https://lp.logrocket.com/blg/css-signup).

[![LogRocket Dashboard Free Trial Banner](https://blog.logrocket.com/wp-content/uploads/2019/12/cpu-memory-usage.png)](https://lp.logrocket.com/blg/css-signup)

[LogRocket](https://lp.logrocket.com/blg/css-signup) lets you replay user sessions, eliminating guesswork around why bugs happen by showing exactly what users experienced. It captures console logs, errors, network requests, and pixel-perfect DOM recordings — compatible with all frameworks.

LogRocket's Galileo AI watches sessions for you, instantly identifying and explaining user struggles with automated monitoring of your entire product experience.

Modernize how you debug web and mobile apps — [start monitoring for free](https://lp.logrocket.com/blg/css-signup).

* [#css](https://blog.logrocket.com/tag/css/)

![](https://blog.logrocket.com/wp-content/uploads/2022/06/footer-cta-dots-left.png)
![](https://blog.logrocket.com/wp-content/uploads/2022/06/footer-cta-dots-right.png)

![](https://blog.logrocket.com/wp-content/uploads/2022/09/logrocket-logo-frontend-analytics.png)

## Stop guessing about your digital experience with LogRocket

[Get started for free](https://lp.logrocket.com/blg/signup)

#### Recent posts:

[![13 Best Tailwind CSS Component Libraries](https://blog.logrocket.com/wp-content/uploads/2024/11/13-best-tailwind-css-component-libraries-1.png)

#### The 13 best Tailwind CSS component libraries](https://blog.logrocket.com/13-best-tailwind-css-component-libraries/)

Tailwind CSS component libraries provide pre-built components to streamline the process of developing aesthetic, user-friendly interfaces.

[![](https://blog.logrocket.com/wp-content/uploads/2020/09/ivaylogerchev-150x150.jpg)](https://blog.logrocket.com/author/ivaylogerchev/)
[Ivaylo Gerchev](https://blog.logrocket.com/author/ivaylogerchev/)

Oct 2, 2026 ⋅ 8 min read

[![Using Jev to route messages and reduce LLM calls](https://blog.logrocket.com/wp-content/uploads/2026/10/featured-image.png)

#### Using Jev to route messages and reduce LLM calls](https://blog.logrocket.com/using-jev-route-messages-reduce-llm-calls/)

Jev is a TypeSafe AI decision model that classifies messages using typed questions. Learn how to use it for routing to reduce unnecessary LLM calls.

[![](https://blog.logrocket.com/wp-content/uploads/2021/11/1629917310656-150x150.jpg)](https://blog.logrocket.com/author/davidomotayo/)
[David Omotayo](https://blog.logrocket.com/author/davidomotayo/)

Oct 2, 2026 ⋅ 8 min read

[![](https://blog.logrocket.com/wp-content/uploads/2026/09/Vibe-coding-vs.-software-engineering-5-real-app-failures.png)

#### Vibe coding gone wrong: 5 of the biggest vibe coding failures](https://blog.logrocket.com/vibe-coding-failures/)

Vibe coding makes building apps faster, but speed without engineering can create serious failures. Here are five real-world examples and practical checks to help you ship AI-generated code safely.

[![](https://blog.logrocket.com/wp-content/uploads/2025/02/Chizaram-Ken-profile-picture-150x150.jpg)](https://blog.logrocket.com/author/emmanuelodioko/)
[Chizaram Ken](https://blog.logrocket.com/author/emmanuelodioko/)

Sep 28, 2026 ⋅ 7 min read

[![React ViewTransition vs. Motion: Comparing animation approaches](https://blog.logrocket.com/wp-content/uploads/2026/09/featured-image-3.png)

#### React ViewTransition vs. Motion: Comparing animation approaches](https://blog.logrocket.com/react-viewtransition-vs-motion-comparing-animation-approaches/)

Compare React ViewTransition and Motion across four animation patterns. The native build saved ~38.6kB of gzipped JS, but required 179 more lines of CSS.

[![](https://blog.logrocket.com/wp-content/uploads/2025/02/Chizaram-Ken-profile-picture-150x150.jpg)](https://blog.logrocket.com/author/emmanuelodioko/)
[Chizaram Ken](https://blog.logrocket.com/author/emmanuelodioko/)

Sep 26, 2026 ⋅ 7 min read

[View all posts](https://blog.logrocket.com/)

Hey there, want to help make our blog better?

Yea
No Thanks

Join LogRocket’s Content Advisory Board. You’ll help inform the type of
content we create and get access to exclusive meetups, social accreditation,
and swag.

[Sign up now](https://lp.logrocket.com/blg/content-advisory-board-signup)
