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

[Share to X](https://twitter.com/intent/tweet?text=%22Vite%20-%20Code%20Splitting%20Strategy%22%20by%20Mark%20%23DEVCommunity%20https%3A%2F%2Fdev.to%2Fmarkliu2013%2Fvite-code-splitting-strategy-5a69)
[Share to LinkedIn](https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fdev.to%2Fmarkliu2013%2Fvite-code-splitting-strategy-5a69&title=Vite%20-%20Code%20Splitting%20Strategy&summary=The%20Problem%20Solved%20by%20Code%20Splitting%20%20%20Firstly%2C%20let%27s%20look%20at%20the%20problems%20with%20the...&source=DEV%20Community)
[Share to Facebook](https://www.facebook.com/sharer.php?u=https%3A%2F%2Fdev.to%2Fmarkliu2013%2Fvite-code-splitting-strategy-5a69)
[Share to Mastodon](https://s2f.kytta.dev/?text=https%3A%2F%2Fdev.to%2Fmarkliu2013%2Fvite-code-splitting-strategy-5a69)

Share Post via...
[Report Abuse](/report-abuse)

[![Mark](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F1280339%2F16fc4be0-d786-4f1a-9a6a-87a347d6a245.jpeg)](/markliu2013)

[Mark](/markliu2013)

Posted on Jun 11, 2024

![](https://assets.dev.to/assets/sparkle-heart-5f9bee3767e18deb1bb725290cb151c25234768a0e9a2bd39370c382d02920cf.svg)

 ![](https://assets.dev.to/assets/multi-unicorn-b44d6f8c23cdd00964192bedc38af3e82463978aa611b4365bd33a0f1f4f3e97.svg)

 ![](https://assets.dev.to/assets/exploding-head-daceb38d627e6ae9b730f36a1e390fca556a4289d5a41abb2c35068ad3e2c4b5.svg)

 ![](https://assets.dev.to/assets/raised-hands-74b2099fd66a39f2d7eed9305ee0f4553df0eb7b4f11b01b6b1b499973048fe5.svg)

 ![](https://assets.dev.to/assets/fire-f60e7a582391810302117f987b22a8ef04a2fe0df7e3258a5f49332df1cec71e.svg)

# Vite - Code Splitting Strategy

[#vite](/t/vite)

## The Problem Solved by Code Splitting

Firstly, let's look at the problems with the traditional single chunk packaging mode:

1. Can not import on demand

All the code is bundled into one chunk, which means that the code needed for page initialization and the code for the route components are all bundled together.

1. Can not use network cache

Normally, the name of a chunk is generated based on the hash value of the file content. Therefore, every time the code is modified, the name of the chunk changes, which prevents the browser from using the local cache.

Code splitting is aimed at resolving these issues to enhance page load performance.

## Vite's Default Chunk Splitting Strategy

### Before version 2.9

* One chunk corresponds to one CSS file.
* Logic code will be packaged into one chunk.
* Third-party dependencies are packaged into one chunk.

### After version 2.9

The changed place is that both the third-party packages and the business code are now in one chunk.

If you want to control the code splitting strategy with a finer granularity, you need to use the [manualChunks](https://rollupjs.org/configuration-options/#output-manualchunks) configuration. The config is approximately as follows:

```
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        /**
         * 1. Use in object form
         * Package the lodash module into a chunk, named lodash
         */
         manualChunks: {
           lodash: ['lodash'],
         },

        /**
         * 2. Use in function form
         * Package all third-party packages into one chunk, named vendor
         */
        manualChunks(id, { getModuleInfo, getModuleIds }) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
```

Enter fullscreen mode

Exit fullscreen mode

## Top comments (0)

Subscribe

![pic](https://media2.dev.to/dynamic/image/width=256,height=,fit=scale-down,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F8j7kvp660rqzt99zui8e.png)

Personal
Trusted User
[Create template](/settings/response-templates)

Templates let you quickly answer FAQs or store snippets for re-use.

Submit
Preview
[Dismiss](/404.html)

[Code of Conduct](/code-of-conduct)
•
[Report abuse](/report-abuse)

Are you sure you want to hide this comment? It will become hidden in your post, but will still be visible via the comment's permalink.

[ ]

Hide child comments as well

Confirm

For further actions, you may consider blocking this person and/or [reporting abuse](/report-abuse)

[![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F1280339%2F16fc4be0-d786-4f1a-9a6a-87a347d6a245.jpeg)

Mark](/markliu2013)

Follow

Full Stack Developer

* Location

  China
* Work

  JavaScript Developer
* Joined

  Feb 14, 2024

### More from [Mark](/markliu2013)

[How to Build Component Libraries

#webpack
#gulp
#vite](/markliu2013/how-to-build-component-libraries-8k2)
[Building Vue3 Component Library from Scratch #5 Use Vite to Package Your Component Library

#vite
#vue](/markliu2013/building-a-vue-3-component-library-from-scratch-part-5-how-to-use-vite-to-package-your-component-library-42n2)

[DEV Community](/) — A space to discuss and keep up software development and manage your software career

- [Home](/)
- [DEV Challenges](/challenges)
- [Reading List](/readinglist)
- [DEV++](/%2B%2B)
- [Videos](/videos)
- [DEV Education Tracks](/deved)
- [DEV Help](/help)
- [Advertise on DEV](/advertise)
- [Organization Accounts](/organizations)
- [DEV Showcase](/showcase)
- [About](/about)
- [Contact](/contact)
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
