[Skip to main content](#main-content)

[![Chrome for Developers](https://www.gstatic.com/devrel-devsite/prod/v5a0f9ff8b593048661361a49e11ab98a8b1ac025e19e60e6189f2b56796f8a43/chrome/images/lockup.svg)](/)

[Docs](https://developer.chrome.com/docs)

* Build with Chrome
* Learn how Chrome works, participate in origin trials, and build with Chrome everywhere.
* [Web Platform](https://developer.chrome.com/docs/web-platform)
* [Isolated Web Apps (IWA)](https://developer.chrome.com/docs/iwa)
* [Capabilities](https://developer.chrome.com/docs/capabilities)
* [Automation and testing](https://developer.chrome.com/docs/automation-and-testing)
* [ChromeDriver](https://developer.chrome.com/docs/chromedriver)
* [Extensions](https://developer.chrome.com/docs/extensions)
* [Chrome Web Store](https://developer.chrome.com/docs/webstore)
* [Chromium](https://developer.chrome.com/docs/chromium)
* [Web on Android](https://developer.chrome.com/docs/android)
* [Origin trials](https://developer.chrome.com/origintrials/)
* [Release notes](https://developer.chrome.com/release-notes)

* Productivity
* Create the best experience for your users with the web's best tools.
* [DevTools](https://developer.chrome.com/docs/devtools)
* [Lighthouse](https://developer.chrome.com/docs/lighthouse)
* [Chrome UX Report](https://developer.chrome.com/docs/crux)
* [Accessibility](https://developer.chrome.com/docs/accessibility)
* [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance)

* Get things done quicker and neater, with our ready-made libraries.
* [Workbox](https://developer.chrome.com/docs/workbox)
* [Puppeteer](https://developer.chrome.com/docs/puppeteer)

* Experience
* Design a beautiful and performant web with Chrome.
* [AI](https://developer.chrome.com/docs/ai)
* [Performance](https://developer.chrome.com/docs/performance)
* [CSS and UI](https://developer.chrome.com/docs/css-ui)
* [Identity](https://developer.chrome.com/docs/identity)
* [Payments](https://developer.chrome.com/docs/payments)
* [Privacy and security](https://developer.chrome.com/docs/privacy-security)
* [Ads](https://developer.chrome.com/docs/ads)

* Resources
* More from Chrome and Google.
* [All documentation](https://developer.chrome.com/docs)
* [Baseline open\_in\_new](https://web.dev/baseline)
* [web.dev open\_in\_new](https://web.dev)
* [PageSpeed Insights audit open\_in\_new](https://pagespeed.web.dev)

[Case studies](https://developer.chrome.com/case-studies)

[Blog](https://developer.chrome.com/blog)

[New in Chrome](https://developer.chrome.com/new)

`/`

* English
* Deutsch
* Español – América Latina
* Français
* Indonesia
* Italiano
* Nederlands
* Polski
* Português – Brasil
* Tiếng Việt
* Türkçe
* Русский
* עברית
* العربيّة
* فارسی
* हिंदी
* বাংলা
* ภาษาไทย
* 中文 – 简体
* 中文 – 繁體
* 日本語
* 한국어

Sign in

* [Docs](https://developer.chrome.com/docs)
* [Capabilities](https://developer.chrome.com/docs/capabilities)

[![Chrome for Developers](https://www.gstatic.com/devrel-devsite/prod/v5a0f9ff8b593048661361a49e11ab98a8b1ac025e19e60e6189f2b56796f8a43/chrome/images/lockup.svg)](/)

* [Docs](/docs)
  + More
* [Case studies](/case-studies)
* [Blog](/blog)
* [New in Chrome](/new)

* Build with Chrome
* [Web Platform](/docs/web-platform)
* [Isolated Web Apps (IWA)](/docs/iwa)
* [Capabilities](/docs/capabilities)
* [Automation and testing](/docs/automation-and-testing)
* [ChromeDriver](/docs/chromedriver)
* [Extensions](/docs/extensions)
* [Chrome Web Store](/docs/webstore)
* [Chromium](/docs/chromium)
* [Web on Android](/docs/android)
* [Origin trials](https://developer.chrome.com/origintrials/)
* [Release notes](/release-notes)
* Productivity
* [DevTools](/docs/devtools)
* [Lighthouse](/docs/lighthouse)
* [Chrome UX Report](/docs/crux)
* [Accessibility](/docs/accessibility)
* [Modern Web Guidance](/docs/modern-web-guidance)
* [Workbox](/docs/workbox)
* [Puppeteer](/docs/puppeteer)
* Experience
* [AI](/docs/ai)
* [Performance](/docs/performance)
* [CSS and UI](/docs/css-ui)
* [Identity](/docs/identity)
* [Payments](/docs/payments)
* [Privacy and security](/docs/privacy-security)
* [Ads](/docs/ads)
* Resources
* [All documentation](/docs)
* [Baseline <span class="material-icons" style="font-size: 12px;" aria-hidden="true" translate="no">open\_in\_new</span>](https://web.dev/baseline)
* [web.dev <span class="material-icons" style="font-size: 12px;" aria-hidden="true" translate="no">open\_in\_new</span>](https://web.dev)
* [PageSpeed Insights audit <span class="material-icons" style="font-size: 12px;" aria-hidden="true" translate="no">open\_in\_new</span>](https://pagespeed.web.dev)

* [Home](https://developer.chrome.com/)
* [Docs](https://developer.chrome.com/docs)
* [Capabilities](https://developer.chrome.com/docs/capabilities)

# Receiving shared data with the Web Share Target API Stay organized with collections Save and categorize content based on your preferences.

Sharing on mobile and desktop simplified with the Web Share Target API

![Pete LePage](https://web.dev/images/authors/petelepage.jpg)

Pete LePage

[X](https://twitter.com/petele)
[GitHub](https://github.com/petele)
[Mastodon](https://techhub.social/%40petele)
[Homepage](https://petelepage.com/)

![Joe Medley](https://web.dev/images/authors/joemedley.jpg)

Joe Medley

[GitHub](https://github.com/jpmedley)

On a mobile or desktop device, sharing should be as straightforward as clicking the **Share** button,
choosing an app, and choosing who to share with. For example, you may want to
share an interesting article, either by emailing it to friends or tweeting it to
the world.

In the past, only platform-specific apps could register with the operating system to
receive shares from other installed apps. But with the Web Share Target API,
installed web apps can register with the underlying operating system
as a share target to receive shared content.

**Note:** The Web Share Target API is only half of the magic. Web apps can share data,
files, links, or text using the Web Share API. See
[Web Share API](https://web.dev/articles/web-share) for details.

![Android phone with the 'Share via' drawer open.](/static/docs/capabilities/web-apis/web-share-target/image/android-phone-the-share-e651a6cf19688.png)

System-level share target picker with an installed PWA as an option.

## See Web Share Target in action

1. Using either Chrome 76 or later for Android, or Chrome 89 or later on
   desktop, open the [Web Share Target demo](https://googlechrome.github.io/samples/scrapbook-pwa/).
2. When prompted, click **Install** to add the app to your home screen, or
   use the Chrome menu to add it to your home screen.
3. Open any app that supports sharing, or use the Share button
   in the demo app.
4. From the target picker, choose **Web Share Test**.

After sharing, you should see all of the shared information in
the web share target web app.

## Register your app as a share target

To register your app as a share target, it needs to meet [Chrome's
installability criteria](https://web.dev/install-criteria/). In addition, before a user can share
to your app, they must add it to their home screen. This prevents sites from
randomly adding themselves to the user's share intent chooser and ensures that
sharing is something that users want to do with your app.

## Update your web app manifest

To register your app as a share target, add a `share_target` entry to its [web
app manifest](https://web.dev/add-manifest/). This tells the operating system to include your app as
an option in the intent chooser. What you add to the manifest controls the data
that your app will accept. There are three common scenarios for the `share_target`
entry:

* Accepting basic information
* Accepting application changes
* Accepting files

**Note:** You can only have one `share_target` per manifest, if you want to share to
different places within your app, provide that as an option on the share
target landing page (the page specified by the `url` entry).

### Accepting basic information

If your target app is merely accepting basic information such as data, links,
and text, add the following to the `manifest.json` file:

```
"share_target": {
  "action": "/share-target/",
  "method": "GET",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url"
  }
}
```

If your application already has a share URL scheme, you can replace the `params`
values with your existing query parameters. For example, if your share URL
scheme uses `body` instead of `text`, you could replace `"text": "text"` with `"text":
"body"`.

The `method` value defaults to `"GET"` if not provided. The `enctype` field, not
shown in this example, indicates the [type of encoding](https://developer.mozilla.org/docs/Web/HTML/Element/form#attr-enctype) for the data.
For the `"GET"` method, `enctype` defaults to `"application/x-www-form-urlencoded"` and
is ignored if it's set to anything else.

### Accepting application changes

If the shared data changes the target app in some way—for example, saving a
bookmark in the target application—set the `method` value to `"POST"` and include
the `enctype` field. The example below creates a bookmark in the target app,
so it uses `"POST"` for the `method` and `"multipart/form-data"` for the
`enctype`:

```
{
  "name": "Bookmark",
  "share_target": {
    "action": "/bookmark",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "url": "link"
    }
  }
}
```

### Accepting files

As with application changes, accepting files requires that `method` be `"POST"`
and that the `enctype` be present. Additionally, `enctype` must be
`"multipart/form-data"`, and a `files` entry must be added.

You must also add a `files` array defining the types of files your app accepts. The
array elements are entries with two members: a `name` field and an `accept`
field. The `accept` field takes a MIME type, a file extension, or an array
containing both. It's best to provide an array that includes both a
MIME type and a file extension since operating systems differ in which
they prefer.

```
{
  "name": "Aggregator",
  "share_target": {
    "action": "/cgi-bin/aggregate",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "name",
      "text": "description",
      "url": "link",
      "files": [
        {
          "name": "records",
          "accept": ["text/csv", ".csv"]
        },
        {
          "name": "graphs",
          "accept": "image/svg+xml"
        }
      ]
    }
  }
}
```

## Handle the incoming content

How you deal with the incoming shared data is up to you and depends on your
app. For example:

* An email client could draft a new email using `title` as the subject of an
  email, with `text` and `url` concatenated together as the body.
* A social networking app could draft a new post ignoring `title`, using
  `text` as the body of the message, and adding `url` as a link. If `text` is
  missing, the app might use `url` in the body as well. If `url` is missing,
  the app might scan `text` looking for a URL and add that as a link.
* A photo sharing app could create a new slideshow using `title` as the
  slideshow title, `text` as a description, and `files` as the slideshow images.
* A text messaging app could draft a new message using `text` and `url`
  concatenated together and dropping `title`.

### Processing GET shares

If the user selects your application, and your `method` is `"GET"` (the
default), the browser opens a new window at the `action` URL. The browser then
generates a query string using the URL-encoded values supplied in the manifest.
For example, if the sharing app provides `title` and `text`, the query string is
`?title=hello&text=world`. To process this, use a [`DOMContentLoaded`](https://developer.mozilla.org/docs/Web/API/Window/DOMContentLoaded_event)
event listener in your foreground page and parse the query string:

```
window.addEventListener('DOMContentLoaded', () => {
  const parsedUrl = new URL(window.location);
  // searchParams.get() will properly handle decoding the values.
  console.log('Title shared: ' + parsedUrl.searchParams.get('title'));
  console.log('Text shared: ' + parsedUrl.searchParams.get('text'));
  console.log('URL shared: ' + parsedUrl.searchParams.get('url'));
});
```

Be sure to use a service worker to [precache](https://web.dev/learn/pwa/caching) the `action`
page so that it loads quickly and works reliably, even if the user is offline.
[Workbox](/docs/workbox) is a tool that can help you
[implement precaching](https://web.dev/articles/precache-with-workbox) in your service worker.

### Processing POST shares

If your `method` is `"POST"`, as it would be if your target app accepts a saved
bookmark or shared files, then the body of the incoming `POST` request contains
the data passed by the sharing application, encoded using the `enctype` value
provided in the manifest.

The foreground page cannot process this data directly. Since the page sees the data as
a request, the page passes it to the service worker, where you can intercept it with a
[`fetch`](https://developer.mozilla.org/docs/Web/API/ServiceWorkerGlobalScope#:%7E:text=Content%20Index.-,fetch,-Occurs%20when%20a)
event listener. From here, you can pass the data back to the foreground
page using `postMessage()` or pass it on to the server:

```
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // If this is an incoming POST request for the
  // registered "action" URL, respond to it.
  if (event.request.method === 'POST' &&
      url.pathname === '/bookmark') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const link = formData.get('link') || '';
      const responseUrl = await saveBookmark(link);
      return Response.redirect(responseUrl, 303);
    })());
  }
});
```

### Verifying shared content

![An Android phone displaying the demo app with shared content.](/static/docs/capabilities/web-apis/web-share-target/image/an-android-phone-displayi-000d1b109b71e.png)

The sample sharing target app.

Be sure to verify incoming data. Unfortunately there is no guarantee that other
apps will share the appropriate content in the right parameter.

For example, on Android, the [`url` field will be empty](https://bugs.chromium.org/p/chromium/issues/detail?id=789379) because
it's not supported in Android's share system. Instead, URLs will often appear in
the `text` field, or occasionally in the `title` field.

## Browser support

The Web Share Target API is supported as described below:

On all platforms, your web app has to be [installed](https://web.dev/install-criteria/) before it will show up as a
potential target for receiving shared data.

## Sample applications

* [Squoosh](https://github.com/GoogleChromeLabs/squoosh)
* [Scrapbook PWA](https://github.com/GoogleChrome/samples/blob/gh-pages/web-share/README.md#web-share-demo)

### Show support for the API

Are you planning to use the Web Share Target API? Your public support helps the Chromium team
prioritize features and shows other browser vendors how critical it is to support them.

Send a tweet to [@ChromiumDev](https://twitter.com/ChromiumDev) using the hashtag
[`#WebShareTarget`](https://twitter.com/search?q=%23WebShareTarget&src=recent_search_click&f=live)
and let us know where and how you're using it.

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2019-11-08 UTC.

[[["Easy to understand","easyToUnderstand","thumb-up"],["Solved my problem","solvedMyProblem","thumb-up"],["Other","otherUp","thumb-up"]],[["Missing the information I need","missingTheInformationINeed","thumb-down"],["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"],["Out of date","outOfDate","thumb-down"],["Samples / code issue","samplesCodeIssue","thumb-down"],["Other","otherDown","thumb-down"]],["Last updated 2019-11-08 UTC."],[],[]]

* ### Contribute

  + [File a bug](https://issuetracker.google.com/issues/new?component=1400036&template=1897236)
  + [See open issues](https://issuetracker.google.com/issues?q=status:open%20componentid:1400036&s=created_time:desc)
* ### Related content

  + [Chromium updates](https://blog.chromium.org/)
  + [Case studies](/case-studies)
  + [Archive](/deprecated)
  + [Podcasts & shows](https://web.dev/shows)
* ### Follow

  + [@ChromiumDev on X](https://twitter.com/ChromiumDev)
  + [YouTube](https://www.youtube.com/user/ChromeDevelopers)
  + [Chrome for Developers on LinkedIn](https://www.linkedin.com/showcase/chrome-for-developers)
  + [RSS](/static/blog/feed.xml)

* [Terms](//policies.google.com/terms)
* [Privacy](//policies.google.com/privacy)
* Manage cookies

* English
* Deutsch
* Español – América Latina
* Français
* Indonesia
* Italiano
* Nederlands
* Polski
* Português – Brasil
* Tiếng Việt
* Türkçe
* Русский
* עברית
* العربيّة
* فارسی
* हिंदी
* বাংলা
* ภาษาไทย
* 中文 – 简体
* 中文 – 繁體
* 日本語
* 한국어
