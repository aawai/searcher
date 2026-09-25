[Skip to main content](#main)

Introducing celld: self-hosted, distributed Durable Objects

[Learn more->](https://celld.dev)

Dismiss

[ ]

`⌘K`

`↑↓Up or down to`navigate`↵Enter to`select`ESCEscape to`close![Search powered by Orama](/images/orama-dark.svg?__frsh_c=1b1f4d7bd0256d51602f33c94cc2e5f315dfa45d)![Search powered by Orama](/images/orama-light.svg?__frsh_c=1b1f4d7bd0256d51602f33c94cc2e5f315dfa45d)

Products

Open Source

* [Deno

  Modern runtime for JavaScript and TypeScript](/)
* [Fresh

  Web framework designed for the edge](https://fresh.deno.dev)
* [Claw Patrol

  Open-source security firewall for agents](https://clawpatrol.dev)
* [JSR

  TypeScript-first ESM package registry](https://jsr.io)

Commercial

* [Deno Deploy

  Easy serverless hosting for your JavaScript projects](/deploy)
* [Deno Sandbox

  Run untrusted code in secure Linux VMs. Built for AI agents.](/deploy/sandbox)
* [Subhosting

  Extend your platform using Deno Deploy's secure infrastructure](/subhosting)
* [Deno for Enterprise

  Enterprise support for runtime projects](/enterprise)

[Docs](https://docs.deno.com)

Modules

* [Standard Library](https://jsr.io/%40std)
* [JSR](https://jsr.io)
* [Node.js & npm](/npm/)

Community

* [Discord](https://discord.gg/deno)
* [GitHub](https://github.com/denoland)
* [Bluesky](https://bsky.app/profile/deno.land)
* [X](https://twitter.com/deno_land)
* [YouTube](https://www.youtube.com/c/deno_land)
* [Mastodon](https://fosstodon.org/%40deno_land)

[Blog](/blog)

`⌘K`

`↑↓Up or down to`navigate`↵Enter to`select`ESCEscape to`close![Search powered by Orama](/images/orama-dark.svg?__frsh_c=1b1f4d7bd0256d51602f33c94cc2e5f315dfa45d)![Search powered by Orama](/images/orama-light.svg?__frsh_c=1b1f4d7bd0256d51602f33c94cc2e5f315dfa45d)

![Hono is now on JSR](/blog/hono-on-jsr/cover.webp)

# Announcing Hono on JSR

June 25, 2024

* [![](https://github.com/lambtron.png)Andy Jiang](https://github.com/lambtron)

* [JSR](/blog?tag=jsr)
* [Announcements](/blog?tag=announcements)

[JSR](https://jsr.io) is a modern JavaScript registry intended to simplify
publishing and consuming JavaScript and TypeScript modules, while also moving
the ecosystem forward by supporting and promoting web standards. Since its
launch, JSR has been well received by the community, with over 250 new packages
being published each week.

Today, we’re thrilled to announce that **[Hono](https://jsr.io/%40hono/hono) is
now available on JSR**.

[Hono](https://hono.dev) is a fast, lightweight, batteries-included,
cross-platform server routing framework that has first class TypeScript and web
standard API support.

Using Hono via JSR offers an excellent developer experience, with fully featured
documentation and type definitions right in your text editor.

## Installing Hono

You can get started with Hono from JSR using the following command:

```
deno add @hono/hono
```

Or using npm:

```
npx jsr add @hono/hono
```

The above command will generate a `deno.json` file, listing all your project
dependencies.

```
// deno.json

{
  "imports": {
    "@hono/hono": "jsr:@hono/hono^4.4.5"
  }
}
```

You can then import the serverless driver to your `main.ts` file:

```
import { Hono } from "@hono/hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Deno!");
});

Deno.serve(app.fetch);
```

For other runtime examples, [please refer to Hono’s documentation](https://github.com/honojs/examples/).

Finally, you can run the following command to execute:

```
​​deno run -A main.ts
```

Note, you can also scaffold your Hono project with the following command:

```
deno run -A npm:create-hono@latest
```

Currently, only the `deno` template selection will use Hono from JSR.

## What’s next?

With Hono on JSR, you can build a lightweight, fast server with API routes that
can run in any JavaScript environment. Your text editor will pull in type
definitions and relevant documentation so that you can be more productive.

> 🚨️ Read more about JSR 🚨️
>
> * [JSR is in open beta](/blog/jsr_open_beta)
> * [Intro to JSR](https://jsr.io/docs/introduction)
> * [How we built JSR](/blog/how-we-built-jsr)
> * [How to document your JavaScript package in 2024](/blog/document-javascript-package)
> * [JSR is not another package manager](/blog/jsr-is-not-another-package-manager)

[![Deno logo](/logos/dark-transparent.svg?__frsh_c=1b1f4d7bd0256d51602f33c94cc2e5f315dfa45d)](/)

## Open-source

* [Deno](/)
* [Fresh](https://fresh.deno.dev/)
* [JSR](https://jsr.io/)

## Products

* [Deno Deploy](/deploy)
* [Deno Sandbox](/deploy/sandbox)
* [Subhosting](/deploy/subhosting)
* [Pricing](/deploy/pricing)
* [Deno Deploy Docs](https://docs.deno.com/deploy/)

## Deno Resources

* [Deno Docs](/manual)
* [Deno API Reference](https://docs.deno.com/api/deno/)
* [Standard Library](https://jsr.io/%40std)
* [Third-Party Modules](https://jsr.io/)
* [Deno Examples](https://examples.deno.land)

## Company

* [Blog](/blog)
* [News](https://deno.news)
* [Branding](/brand)
* [Privacy Policy](https://docs.deno.com/deploy/privacy_policy/)
* [Terms and Conditions](https://docs.deno.com/deploy/terms_and_conditions/)
* Report abuse

[GitHub](https://github.com/denoland)[Discord](https://discord.gg/deno)[Bluesky](https://bsky.app/profile/deno.land)[Mastodon](https://fosstodon.org/%40deno_land)[Twitter or X or whatever](https://twitter.com/deno_land)[YouTube](https://youtube.com/%40deno_land)

Copyright © 2026 Deno Land Inc. All rights reserved. | [All systems operational](https://denostatus.com/)
