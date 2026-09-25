Toggle Menu

Menu[Home](/)[Docs](/docs/installation)[Components](/docs/components)[Blocks](/blocks)[Charts](/charts/area)[Directory](/docs/directory)[Typeset](/typeset)[Create](/create)

Search documentation...Search...

[125k](https://github.com/shadcn-ui/ui)Toggle theme

[New](/create)

Sections

* [Introduction](/docs)
* [Components](/docs/components)
* [Installation](/docs/installation)
* [Theming](/docs/theming)
* [CLI](/docs/cli)
* [Typeset](/docs/typeset)
* [Skills](/docs/skills)
* [Registry](/docs/registry)
* [Changelog](/docs/changelog)

Components

* [Accordion](/docs/components/base/accordion)
* [Alert](/docs/components/base/alert)
* [Alert Dialog](/docs/components/base/alert-dialog)
* [Aspect Ratio](/docs/components/base/aspect-ratio)
* [Attachment](/docs/components/base/attachment)
* [Avatar](/docs/components/base/avatar)
* [Badge](/docs/components/base/badge)
* [Breadcrumb](/docs/components/base/breadcrumb)
* [Bubble](/docs/components/base/bubble)
* [Button](/docs/components/base/button)
* [Button Group](/docs/components/base/button-group)
* [Calendar](/docs/components/base/calendar)
* [Card](/docs/components/base/card)
* [Carousel](/docs/components/base/carousel)
* [Chart](/docs/components/base/chart)
* [Checkbox](/docs/components/base/checkbox)
* [Collapsible](/docs/components/base/collapsible)
* [Combobox](/docs/components/base/combobox)
* [Command](/docs/components/base/command)
* [Context Menu](/docs/components/base/context-menu)
* [Data Table](/docs/components/base/data-table)
* [Date Picker](/docs/components/base/date-picker)
* [Dialog](/docs/components/base/dialog)
* [Direction](/docs/components/base/direction)
* [Drawer](/docs/components/base/drawer)
* [Dropdown Menu](/docs/components/base/dropdown-menu)
* [Empty](/docs/components/base/empty)
* [Field](/docs/components/base/field)
* [Hover Card](/docs/components/base/hover-card)
* [Input](/docs/components/base/input)
* [Input Group](/docs/components/base/input-group)
* [Input OTP](/docs/components/base/input-otp)
* [Item](/docs/components/base/item)
* [Kbd](/docs/components/base/kbd)
* [Label](/docs/components/base/label)
* [Marker](/docs/components/base/marker)
* [Menubar](/docs/components/base/menubar)
* [Message](/docs/components/base/message)
* [Message Scroller](/docs/components/base/message-scroller)
* [Native Select](/docs/components/base/native-select)
* [Navigation Menu](/docs/components/base/navigation-menu)
* [Pagination](/docs/components/base/pagination)
* [Popover](/docs/components/base/popover)
* [Progress](/docs/components/base/progress)
* [Questionnaire](/docs/components/base/questionnaire)
* [Radio Group](/docs/components/base/radio-group)
* [Resizable](/docs/components/base/resizable)
* [Scroll Area](/docs/components/base/scroll-area)
* [Select](/docs/components/base/select)
* [Separator](/docs/components/base/separator)
* [Sheet](/docs/components/base/sheet)
* [Sidebar](/docs/components/base/sidebar)
* [Skeleton](/docs/components/base/skeleton)
* [Slider](/docs/components/base/slider)
* [Spinner](/docs/components/base/spinner)
* [Switch](/docs/components/base/switch)
* [Table](/docs/components/base/table)
* [Tabs](/docs/components/base/tabs)
* [Textarea](/docs/components/base/textarea)
* [Toast](/docs/components/base/toast)
* [Toggle](/docs/components/base/toggle)
* [Toggle Group](/docs/components/base/toggle-group)
* [Tooltip](/docs/components/base/tooltip)
* [Typography](/docs/components/base/typography)

Get Started

* [Installation](/docs/installation)
* [components.json](/docs/components-json)
* [Package Imports](/docs/package-imports)
* [Theming](/docs/theming)
* [Typeset](/docs/typeset)
* [Dark Mode](/docs/dark-mode)
* [CLI](/docs/cli)
* [Monorepo](/docs/monorepo)
* [Skills](/docs/skills)
* [JavaScript](/docs/javascript)
* [Figma](/docs/figma)
* [llms.txt](/llms.txt)
* [Legacy Docs](/docs/legacy)

@shadcn/react

* [Message Scroller](/docs/react/message-scroller)
* [Questionnaire](/docs/react/questionnaire)

@shadcn/helpers

* [AI SDK](/docs/helpers/ai-sdk)
* [TanStack AI](/docs/helpers/tanstack-ai)

Forms

* [React Hook Form](/docs/forms/react-hook-form)
* [TanStack Form](/docs/forms/tanstack-form)
* [Formisch](/docs/forms/formisch)

Utilities

* [scroll-fade](/docs/utils/scroll-fade)
* [shimmer](/docs/utils/shimmer)

Registry

* [Introduction](/docs/registry)
* [Getting Started](/docs/registry/getting-started)
* [GitHub Registries](/docs/registry/github)
* [Registry Directory](/docs/registry/registry-index)
* [Registry Health](/docs/registry/health)
* [Examples](/docs/registry/examples)
* [Namespaces](/docs/registry/namespace)
* [Authentication](/docs/registry/authentication)
* [Dynamic Search](/docs/registry/dynamic-search)
* [MCP Server](/docs/registry/mcp)
* [Open in v0](/docs/registry/open-in-v0)
* [API Reference](/docs/registry/api-reference)
* [registry.json](/docs/registry/registry-json)
* [registry-item.json](/docs/registry/registry-item-json)

# Introduction

Copy Page

[Previous](/docs/components/radix/typography)[Next](/docs/installation)

shadcn/ui is a set of beautifully-designed, accessible components and a code distribution platform. Works with your favorite frameworks and AI models. Open Source. Open Code.

**This is not a component library. It is how you build your component library.**

You know how most traditional component libraries work: you install a package from NPM, import the components, and use them in your app.

This approach works well until you need to customize a component to fit your design system or require one that isn’t included in the library. **Often, you end up wrapping library components, writing workarounds to override styles, or mixing components from different libraries with incompatible APIs.**

This is what shadcn/ui aims to solve. It is built around the following principles:

* **Open Code:** The top layer of your component code is open for modification.
* **Composition:** Every component uses a common, composable interface, making them predictable.
* **Distribution:** A flat-file schema and command-line tool make it easy to distribute components.
* **Beautiful Defaults:** Carefully chosen default styles, so you get great design out-of-the-box.
* **AI-Ready:** Open code for LLMs to read, understand, and improve.

## [Open Code#](#open-code)

shadcn/ui hands you the actual component code. You have full control to customize and extend the components to your needs. This means:

* **Full Transparency:** You see exactly how each component is built.
* **Easy Customization:** Modify any part of a component to fit your design and functionality requirements.
* **AI Integration:** Access to the code makes it straightforward for LLMs to read, understand, and even improve your components.

*In a typical library, if you need to change a button’s behavior, you have to override styles or wrap the component. With shadcn/ui, you simply edit the button code directly.*

### How do I pull upstream updates in an Open Code approach?

## [Composition#](#composition)

Every component in shadcn/ui shares a common, composable interface. **If a component does not exist, we bring it in, make it composable, and adjust its style to match and work with the rest of the design system.**

*A shared, composable interface means it's predictable for both your team and LLMs. You are not learning different APIs for every new component. Even for third-party ones.*

## [Distribution#](#distribution)

shadcn/ui is also a code distribution system. It defines a schema for components and a CLI to distribute them.

* **Schema:** A flat-file structure that defines the components, their dependencies, and properties.
* **CLI:** A command-line tool to distribute and install components across projects with cross-framework support.

*You can use the schema to distribute your components to other projects or have AI generate completely new components based on existing schema.*

## [Beautiful Defaults#](#beautiful-defaults)

shadcn/ui comes with a large collection of components that have carefully chosen default styles. They are designed to look good on their own and to work well together as a consistent system:

* **Good Out-of-the-Box:** Your UI has a clean and minimal look without extra work.
* **Unified Design:** Components naturally fit with one another. Each component is built to match the others, keeping your UI consistent.
* **Easily Customizable:** If you want to change something, it's simple to override and extend the defaults.

## [AI-Ready#](#ai-ready)

The design of shadcn/ui makes it easy for AI tools to work with your code. Its open code and consistent API allow AI models to read, understand, and even generate new components.

*An AI model can learn how your components work and suggest improvements or even create new components that integrate with your existing design.*

[Typography](/docs/components/radix/typography)[Installation](/docs/installation)

On This Page

[Open Code](#open-code)[Composition](#composition)[Distribution](#distribution)[Beautiful Defaults](#beautiful-defaults)[AI-Ready](#ai-ready)

Deploy your shadcn/ui app on Vercel

Trusted by OpenAI, Sonos, Adobe, and more.

Vercel provides tools and infrastructure to deploy apps and features at scale.

Deploy Now[Deploy to Vercel](https://vercel.com/new?utm_source=shadcn_site&utm_medium=web&utm_campaign=docs_cta_deploy_now_callout)

Built by [shadcn](https://twitter.com/shadcn) at [Vercel](https://vercel.com/new?utm_source=shadcn_site&utm_medium=web&utm_campaign=docs_cta_deploy_now_callout). The source code is available on [GitHub](https://github.com/shadcn-ui/ui).

Get Code
