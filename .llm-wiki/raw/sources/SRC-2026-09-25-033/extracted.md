[Skip to content](#main-content)

Navigation menu

[![DEV Community](https://media2.dev.to/dynamic/image/quality=100/https://dev-to-uploads.s3.amazonaws.com/uploads/logos/resized_logo_UQww2soKuUsjaOGNB38o.png)](/)

Search

[Powered by Algolia
Search](https://www.algolia.com/developers/?utm_source=devto&utm_medium=referral)

[Log in](https://dev.to/enter?signup_subforem=1)
[Create account](https://dev.to/enter?signup_subforem=1&state=new-user)

## DEV Community

Close

![](https://assets.dev.to/assets/heart-plus-active-9ea3b22f2bc311281db911d416166c5f430636e76b15cd5df6b3b841d830eefa.svg)

Add reaction

![](https://assets.dev.to/assets/sparkle-heart-5f9bee3767e18deb1bb725290cb151c25234768a0e9a2bd39370c382d02920cf.svg)

Like

![](https://assets.dev.to/assets/multi-unicorn-b44d6f8c23cdd00964192bedc38af3e82463978aa611b4365bd33a0f1f4f3e97.svg)

Unicorn

![](https://assets.dev.to/assets/exploding-head-daceb38d627e6ae9b730f36a1e390fca556a4289d5a41abb2c35068ad3e2c4b5.svg)

Exploding Head

![](https://assets.dev.to/assets/raised-hands-74b2099fd66a39f2d7eed9305ee0f4553df0eb7b4f11b01b6b1b499973048fe5.svg)

Raised Hands

![](https://assets.dev.to/assets/fire-f60e7a582391810302117f987b22a8ef04a2fe0df7e3258a5f49332df1cec71e.svg)

Fire

Jump to Comments

Save

Boost

Pick as gem

More...

Copy link
Copy link

Copied to Clipboard

[Share to X](https://twitter.com/intent/tweet?text=%22Drizzle%20%2B%20Zod%3A%20A%20Type-Safe%20API%20in%20200%20Lines%22%20by%20Gabriel%20Anhaia%20%23DEVCommunity%20https%3A%2F%2Fdev.to%2Fgabrielanhaia%2Fdrizzle-zod-a-type-safe-api-in-200-lines-5bde)
[Share to LinkedIn](https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fdev.to%2Fgabrielanhaia%2Fdrizzle-zod-a-type-safe-api-in-200-lines-5bde&title=Drizzle%20%2B%20Zod%3A%20A%20Type-Safe%20API%20in%20200%20Lines&summary=Schema%20once.%20Drizzle%20queries%2C%20Zod%20validators%2C%20Hono%20routes%2C%20RPC%20client%20%E2%80%94%20every%20layer%20reads%20the%20same%20type.%20Vertical%20type%20safety%20in%20200%20lines.&source=DEV%20Community)
[Share to Facebook](https://www.facebook.com/sharer.php?u=https%3A%2F%2Fdev.to%2Fgabrielanhaia%2Fdrizzle-zod-a-type-safe-api-in-200-lines-5bde)
[Share to Mastodon](https://s2f.kytta.dev/?text=https%3A%2F%2Fdev.to%2Fgabrielanhaia%2Fdrizzle-zod-a-type-safe-api-in-200-lines-5bde)

Share Post via...
[Report Abuse](/report-abuse)

[![Cover image for Drizzle + Zod: A Type-Safe API in 200 Lines](https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fibeenq4fujak0lsqd9j9.png)](https://media2.dev.to/dynamic/image/width%3D1000%2Cheight%3D420%2Cfit%3Dcover%2Cgravity%3Dauto%2Cformat%3Dauto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fibeenq4fujak0lsqd9j9.png)

[![Gabriel Anhaia](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F425693%2F531a245a-bc24-453e-bb2b-eb7077a3da8b.png)](/gabrielanhaia)

[Gabriel Anhaia](/gabrielanhaia)

Posted on May 3

![](https://assets.dev.to/assets/sparkle-heart-5f9bee3767e18deb1bb725290cb151c25234768a0e9a2bd39370c382d02920cf.svg)

 ![](https://assets.dev.to/assets/multi-unicorn-b44d6f8c23cdd00964192bedc38af3e82463978aa611b4365bd33a0f1f4f3e97.svg)

 ![](https://assets.dev.to/assets/exploding-head-daceb38d627e6ae9b730f36a1e390fca556a4289d5a41abb2c35068ad3e2c4b5.svg)

 ![](https://assets.dev.to/assets/raised-hands-74b2099fd66a39f2d7eed9305ee0f4553df0eb7b4f11b01b6b1b499973048fe5.svg)

 ![](https://assets.dev.to/assets/fire-f60e7a582391810302117f987b22a8ef04a2fe0df7e3258a5f49332df1cec71e.svg)

# Drizzle + Zod: A Type-Safe API in 200 Lines

[#typescript](/t/typescript)
[#drizzle](/t/drizzle)
[#zod](/t/zod)
[#webdev](/t/webdev)

* **Book:** [TypeScript in Production](https://www.amazon.com/dp/B0GZB7F471)
* **Also by me:** *The TypeScript Library* — [the 5-book collection](https://xgabriel.com/the-typescript-library)
* **My project:** [Hermes IDE](https://hermes-ide.com) | [GitHub](https://github.com/hermes-hq/hermes-ide) — an IDE for developers who ship with Claude Code and other AI coding tools
* **Me:** [xgabriel.com](https://xgabriel.com) | [GitHub](https://github.com/gabrielanhaia)

---

A typical TypeScript HTTP service has five layers, and most teams write the same type five times.

The column lives in the database. The ORM model mirrors it. A request DTO picks a subset. A validator checks the DTO. The handler returns a response shape that lines up with the row again. Each one is hand-typed, and each one drifts. The typo that costs you Friday afternoon is between `userName` in the validator and `username` in the SQL.

Drizzle, drizzle-zod, and Hono let you write that schema exactly once. The column type flows down the stack: row type, insert type, request validator, handler return, RPC client on the frontend. Five layers, one source of truth, and the compiler shouts when any of them stop matching.

This post walks a small end-to-end example: a `posts` table, a `POST /posts` endpoint, a `GET /posts/:id` endpoint, and a typed client. Around 200 lines of TypeScript total.

## The Stack

Four packages. All current at the time of writing.

* **drizzle-orm** is on the v1.0 release-candidate track (`1.0.0-rc.1`, with betas at `1.0.0-beta.22`). The v1 line shipped JIT row mappers, Effect v4 support, MSSQL, and a [reworked casing API](https://orm.drizzle.team/docs/upgrade-v1). The 0.x line is still installable.
* **drizzle-zod** is the official adapter and exposes `createInsertSchema`, `createSelectSchema`, `createUpdateSchema`, plus the newer [`createSchemaFactory`](https://orm.drizzle.team/docs/zod) for injecting your own Zod instance.
* **Zod 4** is stable, with a smaller bundle and a [`@zod/mini` distribution at roughly 1.9 KB gzipped](https://zod.dev/v4) for the frontend. Zod 3 is still exported from the root and from `zod/v3`.
* **Hono** is at 4.12.x and runs on Node, Bun, Deno, Cloudflare Workers, and Vercel Edge. The `@hono/zod-validator` middleware (0.7.x) hooks schemas into routes and exposes the parsed payload via `c.req.valid()`.

Public examples repo: [the-typescript-library-examples](https://github.com/gabrielanhaia/the-typescript-library-examples).

## Step 1: The Schema

One file. One source of truth.

```
// src/db/schema.ts
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id')
    .references(() => users.id)
    .notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

Enter fullscreen mode

Exit fullscreen mode

That declaration is the migration source (via `drizzle-kit generate`), the row type source, and the validator source. You do not write the column names anywhere else in the project unless you mean to.

The row types fall out of the table for free:

```
// src/db/types.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { posts, users } from './schema'

export type User = InferSelectModel<typeof users>
// { id: number; email: string; name: string; createdAt: Date }

export type Post = InferSelectModel<typeof posts>
// { id; authorId; title; body; publishedAt: Date | null; createdAt: Date }

export type NewPost = InferInsertModel<typeof posts>
// { id?; authorId; title; body; publishedAt?: Date | null; createdAt?: Date }
```

Enter fullscreen mode

Exit fullscreen mode

`publishedAt` is `Date | null` on select because the column is nullable, optional on insert for the same reason. `createdAt` is required on select (`.notNull()`) and optional on insert (`defaultNow()`). None of those facts are typed twice.

## Step 2: drizzle-zod Generates the Validators

Hand-written validators are where drift starts. Change a column from `text` to `varchar({ length: 200 })`, and the API still happily accepts a 4 KB title that the database rejects. drizzle-zod removes that drift by reading the same column definitions and emitting a Zod schema.

```
// src/db/validators.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { posts } from './schema'

// raw, schema-derived validator: every column with its width / nullability
const baseInsertPost = createInsertSchema(posts)

// trim what the API actually accepts on the wire
export const createPostInput = baseInsertPost
  .pick({ authorId: true, title: true, body: true, publishedAt: true })
  .extend({
    title: z.string().min(1).max(200),
    body: z.string().min(1),
  })

export type CreatePostInput = z.infer<typeof createPostInput>

// response shape — exactly the row, no leaks
export const postResponse = createSelectSchema(posts)
export type PostResponse = z.infer<typeof postResponse>
```

Enter fullscreen mode

Exit fullscreen mode

`varchar('title', { length: 200 })` becomes `z.string().max(200)` inside `baseInsertPost`. The `.notNull()` becomes a non-optional Zod field. Change the column to `varchar({ length: 80 })` next sprint and the `.max()` moves with it on the next compile.

`.pick()` strips fields the client should never set (`id`, `createdAt`). `.extend()` adds business rules the column does not know about, like `min(1)` to reject empty titles. You can also pass per-column overrides directly into `createInsertSchema(table, { email: (s) => s.email().toLowerCase() })`, which keeps the refinement next to the column declaration when that reads better than `.extend()`.

## Step 3: Hono Routes With zValidator

The route file is where the type chain becomes visible. `zValidator('json', createPostInput)` plugs the validator into the route. The handler reads the parsed body via `c.req.valid('json')` and gets `CreatePostInput` for free, with no cast.

```
// src/routes/posts.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client'
import { posts } from '../db/schema'
import { createPostInput, postResponse } from '../db/validators'

const idParam = z.object({ id: z.coerce.number().int().positive() })

export const postsRoutes = new Hono()
  .post('/posts', zValidator('json', createPostInput), async (c) => {
    const input = c.req.valid('json')
    // input: { authorId; title; body; publishedAt?: Date | null }

    const [row] = await db.insert(posts).values(input).returning()
    // row: Post — exactly InferSelectModel<typeof posts>

    return c.json(row, 201)
  })
  .get('/posts/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param')

    const [row] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1)

    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(row, 200)
  })
```

Enter fullscreen mode

Exit fullscreen mode

A few things at the type level look invisible until you change the schema and watch them light up.

`c.req.valid('json')` returns `CreatePostInput`. Reference `input.userId` (a typo for `authorId`) and the compiler refuses. Reach into `await c.req.json()` directly and you get `unknown` — Hono will not let you read shape from an unparsed body.

`db.insert(posts).values(input)` accepts only the inferred insert type. If `createPostInput` drifts and adds a `slug` not on the table, `values()` rejects it at compile time.

`returning()` produces `Post[]` because Drizzle reads the column types. `c.json(row, 201)` returns `TypedResponse<Post, 201>`.

## Step 4: The Handler Returns a Typed Row

Most ORMs let you write `db.insert(table).values(...).returning()` and get back `any`. Drizzle returns the row type the schema declared, with no annotation and no cast.

```
async function demo() {
  const [created] = await db
    .insert(posts)
    .values({ authorId: 7, title: 'A quiet win', body: 'Schema once.' })
    .returning()

  created.title        // string
  created.publishedAt  // Date | null
  // created.slug      // would not type-check: no such field on Post
}
```

Enter fullscreen mode

Exit fullscreen mode

Selects narrow when you pick a subset:

```
const projected = await db
  .select({ id: posts.id, title: posts.title })
  .from(posts)
  .limit(20)
// projected: { id: number; title: string }[]
```

Enter fullscreen mode

Exit fullscreen mode

`c.json(projected)` captures `{ id: number; title: string }[]` as the response payload type. The route signature includes this. The RPC client picks it up.

## Step 5: The RPC Client Closes the Loop

Hono ships an RPC client that reads route types directly, with no code generation and no OpenAPI step. It is a typed proxy over the routes' inferred signatures.

```
// src/server.ts
import { Hono } from 'hono'
import { postsRoutes } from './routes/posts'

const app = new Hono().route('/api', postsRoutes)
export type AppType = typeof app
export default app
```

Enter fullscreen mode

Exit fullscreen mode

```
// src/client.ts (in a Next/Vite/Bun frontend)
import { hc } from 'hono/client'
import type { AppType } from './server'

const api = hc<AppType>('https://api.example.com')

const res = await api.api.posts.$post({
  json: {
    authorId: 7,
    title: 'A quiet win',
    body: 'Schema once.',
    // adding `slug: 'a-quiet-win'` here would not type-check —
    // the field is not in CreatePostInput.
  },
})

if (res.status === 201) {
  const post = await res.json() // post: Post
  post.publishedAt // Date | null
}
```

Enter fullscreen mode

Exit fullscreen mode

The frontend refuses to compile if it sends a `slug` the API does not accept, or reads a field the API does not return. The wire format is type-checked end to end.

One subtle part: `post.publishedAt` is `Date | null` in the server's `Post`, but JSON has no `Date`. If you care, declare a `.transform()` on the response schema or use `superjson`. The "the server sends a `Date`" lie is one of the few places this stack does not catch you for free.

[![Schema flowing as typed arrows into Drizzle, Zod, Hono, and the RPC client](https://media2.dev.to/dynamic/image/width=800%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fraw.githubusercontent.com%2Fgabrielanhaia%2Fdev-to-posts%2Fmain%2Fassets%2Fdiagrams%2F614-drizzle-zod-type-safe-api-200-lines-fig1.png)](https://media2.dev.to/dynamic/image/width%3D800%2Cheight%3D%2Cfit%3Dscale-down%2Cgravity%3Dauto%2Cformat%3Dauto/https%3A%2F%2Fraw.githubusercontent.com%2Fgabrielanhaia%2Fdev-to-posts%2Fmain%2Fassets%2Fdiagrams%2F614-drizzle-zod-type-safe-api-200-lines-fig1.png)

The full vertical lands under 200 lines: schema, validators, two routes, the Hono app, the RPC client, and a mirrored users module. No code generation, no `openapi.yaml` round trip, no DTO classes, no mappers between layers. The schema is the contract, and the contract is checked.

## The Type Flow When You Change the Schema

This is the demo that sells the stack. Open `schema.ts` and change `title: varchar('title', { length: 200 })` to `varchar('title', { length: 80 })`. Save the file and the compiler turns red across the stack.

1. `validators.ts` — `createInsertSchema(posts)` re-derives. The `.max(200)` override now contradicts the column. Drop the override or move the rule.
2. `routes/posts.ts` — any 200-char fixture or seed inside the route file breaks.
3. The frontend `client.ts` — the runtime validator fails cleanly with the new `max(80)` on long titles.
4. `migrations/` — `drizzle-kit generate` emits a SQL migration narrowing the column.

Now drop a column entirely. Remove `publishedAt` from `posts`. The handler that returns `row.publishedAt` is a compile error. The validator that picks it is a compile error. The frontend that reads it is a compile error. Nothing slips through.

This is the dividend [schema-first design](https://orm.drizzle.team/) pays. The type system has a relationship with the database, checked by the compiler instead of policed by a careful reviewer.

[![Changing one column in schema.ts and four files lighting up red across the stack](https://media2.dev.to/dynamic/image/width=800%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fraw.githubusercontent.com%2Fgabrielanhaia%2Fdev-to-posts%2Fmain%2Fassets%2Fdiagrams%2F614-drizzle-zod-type-safe-api-200-lines-fig2.png)](https://media2.dev.to/dynamic/image/width%3D800%2Cheight%3D%2Cfit%3Dscale-down%2Cgravity%3Dauto%2Cformat%3Dauto/https%3A%2F%2Fraw.githubusercontent.com%2Fgabrielanhaia%2Fdev-to-posts%2Fmain%2Fassets%2Fdiagrams%2F614-drizzle-zod-type-safe-api-200-lines-fig2.png)

## When This Stack Falls Down

Three places. They are real.

**Heavy custom queries.** Drizzle's query builder maps cleanly to SQL most of the time, but the moment you reach for window functions, `LATERAL` joins, or `WITH RECURSIVE`, the API stops being the path of least resistance. You drop into `sql\`...``template literals and the type narrowing weakens. You can [tag the SQL with a return shape](https://orm.drizzle.team/docs/sql), but that shape is now a manual claim again, with the same trust profile as a Knex`as DTO` cast. If two thirds of your queries are bespoke analytics SQL, the schema-first dividend shrinks.

**Multi-tenant fan-out.** When every query needs `WHERE tenant_id = ?` and the type system has no opinion on whether you remembered, the column-as-truth model does not save you. RLS in the database is the right answer, but RLS does not show up in the inferred row type — Drizzle still thinks the query could return rows from any tenant. You push tenancy into a query-layer wrapper or rely on the database.

**Discriminated polymorphic relations.** If your domain is `commentable` / `taggable` Eloquent-style morphs, Drizzle does not bake polymorphism into the DSL. You model it with discriminated unions over a `type` column and a nullable foreign key per variant. It works, but the ergonomics of `morphTo` are gone.

For a SaaS CRUD API with a moderate amount of bespoke SQL, none of these are dealbreakers. For an analytics-heavy warehouse frontend or a domain that lives on polymorphism, the stack stops earning its keep at the same rate.

## Forward Motion

Most TypeScript teams already write four of these five layers. The migration is in `migrations/`. The query is in `db/`. The validator is in `validators/`. The route is in `routes/`. The drift between them is the work nobody schedules and everybody does, usually as a Friday emergency after a column rename broke the wrong service.

Drizzle, drizzle-zod, and Hono do not eliminate that work. They put it in one file, and every other layer is inferred from there. When the column changes, the compiler points at the places that need to follow.

Two hundred lines is not a benchmark. It is the smallest version of this pattern that does anything useful. Yours will be longer; the shape stays the same.

---

If this stack maps to how you want to ship TypeScript, [TypeScript in Production](https://www.amazon.com/dp/B0GZB7F471) goes deeper on the build, monorepo, and library-authoring decisions around it — tsconfig across Node, Bun, Deno and the browser; dual ESM/CJS publishing; JSR; monorepo wiring; runtime targets.

It is one of five books in *The TypeScript Library*:

1. **[TypeScript Essentials](https://www.amazon.com/dp/B0GZB7QRW3)** — entry point. Types, narrowing, modules, async, daily-driver tooling.
2. **[The TypeScript Type System](https://www.amazon.com/dp/B0GZB86QYW)** — deep dive. Generics, mapped/conditional types, infer, template literals, branded types.
3. **[Kotlin and Java to TypeScript](https://www.amazon.com/dp/B0GZB2333H)** — bridge for JVM developers. Variance, null safety, sealed→unions, coroutines→async/await.
4. **[PHP to TypeScript](https://www.amazon.com/dp/B0GZBD5HMF)** — bridge for PHP 8+ developers. Sync→async paradigm, generics, discriminated unions.
5. **[TypeScript in Production](https://www.amazon.com/dp/B0GZB7F471)** — production layer. tsconfig, build tools, monorepos, library authoring, dual ESM/CJS, JSR.

Books 1 and 2 are the core path. Books 3 and 4 substitute for them if you speak JVM or PHP. Book 5 is for anyone shipping TS at work.

*All five books ship in ebook, paperback, and hardcover.*

[![The TypeScript Library — the 5-book collection](https://media2.dev.to/dynamic/image/width=800%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F3jr2flyttdd57tt7czn5.png)](https://xgabriel.com/the-typescript-library)

## Top comments (1)

Subscribe

![pic](https://media2.dev.to/dynamic/image/width=256,height=,fit=scale-down,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F8j7kvp660rqzt99zui8e.png)

Personal
Trusted User
[Create template](/settings/response-templates)

Templates let you quickly answer FAQs or store snippets for re-use.

Submit
Preview
[Dismiss](/404.html)

Collapse

Expand

[![albertwei profile image](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3949851%2F05798e34-107c-4444-81c3-a00be3ff7a99.png)](https://dev.to/albertwei)

[Albert](https://dev.to/albertwei)

Albert

[![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3949851%2F05798e34-107c-4444-81c3-a00be3ff7a99.png)

Albert](/albertwei)

Follow

I build small developer tools around TypeScript, schemas, code generation, and static sites. Currently working on Schemato, a browser-only schema converter.

* Location

  USA
* Pronouns

  he/him
* Work

  Independent developer
* Joined

  May 25, 2026

•
[Jun 4](https://dev.to/gabrielanhaia/drizzle-zod-a-type-safe-api-in-200-lines-5bde#comment-392bg)

Dropdown menu

* [Copy link](https://dev.to/gabrielanhaia/drizzle-zod-a-type-safe-api-in-200-lines-5bde#comment-392bg)
* Hide

The Drizzle + Zod combination is a nice example of keeping the DB shape and runtime validation close together. The part I find most useful is reducing drift between what the API accepts and what the schema actually stores — that tends to be where small backend tools quietly save a lot of maintenance time.

Like comment:
Like comment:

1 like

Like

Comment button
Reply

[Code of Conduct](/code-of-conduct)
•
[Report abuse](/report-abuse)

Are you sure you want to hide this comment? It will become hidden in your post, but will still be visible via the comment's permalink.

[ ]

Hide child comments as well

Confirm

For further actions, you may consider blocking this person and/or [reporting abuse](/report-abuse)

[![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F425693%2F531a245a-bc24-453e-bb2b-eb7077a3da8b.png)

Gabriel Anhaia](/gabrielanhaia)

Follow

Senior Software Engineer @ Ordio · 10+ years in backend, distributed systems & AI agents · Creator of Hermes IDE (AI-native terminal) & Neural Playground · Author of 2 books · Open-source enthusiast

* Location

  Berlin, Germany
* Work

  Software Engineer and Book Author
* Joined

  Jul 6, 2020

### More from [Gabriel Anhaia](/gabrielanhaia)

[Jev Beat GPT Luna by 1 Point. GPT-6 and Claude Wrote the Answer Key.

#ai
#llm
#typescript
#testing](/gabrielanhaia/jev-beat-gpt-luna-by-1-point-gpt-6-and-claude-wrote-the-answer-key-314k)
[Your Agent Burns LLM Money on Switch Statements. Jev Claims 444x Less

#ai
#agents
#typescript
#llm](/gabrielanhaia/your-agent-burns-llm-money-on-switch-statements-jev-claims-444x-less-23l4)
[He Says He Co-Invented ChatGPT. His New AI, Jev, Won't Write a Word

#ai
#llm
#typescript
#machinelearning](/gabrielanhaia/he-says-he-co-invented-chatgpt-his-new-ai-jev-wont-write-a-word-e3c)

[DEV Community](/) — A space to discuss and keep up software development and manage your software career

- [Home](/)
- [DEV Challenges](/challenges)
- [DEV++](/%2B%2B)
- [Videos](/videos)
- [DEV Education Tracks](/deved)
- [DEV Help](/help)
- [Advertise on DEV](/advertise)
- [Organization Accounts](/organizations)
- [DEV Showcase](/showcase)
- [About](/about)
- [Contact](/contact)
- [Free Postgres Database](/free-postgres-database-tier)
- [DEV Shop](https://shop.forem.com/)
- [MLH](https://mlh.io/)

- [Code of Conduct](/code-of-conduct)
- [Privacy Policy](/privacy)
- [Terms of Use](/terms)

Built on [Forem](https://www.forem.com) — the [open source](https://dev.to/t/opensource) software that powers [DEV](https://dev.to) and other inclusive communities.

Made with love and [Ruby on Rails](https://dev.to/t/rails). DEV Community © 2016 - 2026.

![DEV Community](https://media2.dev.to/dynamic/image/width=190,height=,fit=scale-down,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F8j7kvp660rqzt99zui8e.png)

We're a place where coders share, stay up-to-date and grow their careers.

[Log in](https://dev.to/enter?signup_subforem=1)
[Create account](https://dev.to/enter?signup_subforem=1&state=new-user)

![](https://assets.dev.to/assets/sparkle-heart-5f9bee3767e18deb1bb725290cb151c25234768a0e9a2bd39370c382d02920cf.svg)
![](https://assets.dev.to/assets/multi-unicorn-b44d6f8c23cdd00964192bedc38af3e82463978aa611b4365bd33a0f1f4f3e97.svg)
![](https://assets.dev.to/assets/exploding-head-daceb38d627e6ae9b730f36a1e390fca556a4289d5a41abb2c35068ad3e2c4b5.svg)
![](https://assets.dev.to/assets/raised-hands-74b2099fd66a39f2d7eed9305ee0f4553df0eb7b4f11b01b6b1b499973048fe5.svg)
![](https://assets.dev.to/assets/fire-f60e7a582391810302117f987b22a8ef04a2fe0df7e3258a5f49332df1cec71e.svg)
