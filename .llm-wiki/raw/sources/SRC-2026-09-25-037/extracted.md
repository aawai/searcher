[Skip to main content](#main-content)

[![web.dev](https://www.gstatic.com/devrel-devsite/prod/v5be16d8c9f9402e54c2da2ff24cb75c148f5d2bc84c6f8dfc8b9e16ae456160b/web/images/lockup.svg)](/)

Resources

- Web Platform
- Dive into the web platform, at your pace.
- [HTML](https://web.dev/html)
- [CSS](https://web.dev/css)
- [JavaScript](https://web.dev/javascript)

- User experience
- Learn how to build better user experiences.
- [Performance](https://web.dev/performance)
- [Accessibility](https://web.dev/accessibility)
- [Identity](https://web.dev/identity)

- Learn
- Get up to speed on web development.
- [Learn HTML](https://web.dev/learn/html)
- [Learn CSS](https://web.dev/learn/css)
- [Learn JavaScript](https://web.dev/learn/javascript)
- [Learn AI](https://web.dev/learn/ai)
- [Learn Performance](https://web.dev/learn/performance)
- [Learn Accessibility](https://web.dev/learn/accessibility)
- [More courses](https://web.dev/learn)

- Additional resources
- Explore content collections, patterns, and more.
- [AI and the web](https://web.dev/explore/ai)
- [Explore](https://web.dev/explore)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [Podcasts & shows](https://web.dev/shows)
- [Developer Newsletter](https://web.dev/newsletter)
- [About web.dev](https://web.dev/about)

[Discover](https://web.dev/discover)

[Baseline](https://web.dev/baseline)

[How to use Baseline](https://web.dev/how-to-use-baseline)

[Blog](https://web.dev/blog)

[Case Studies](https://web.dev/case-studies)

`/`

- English
- Deutsch
- Español – América Latina
- Français
- Indonesia
- Italiano
- Polski
- Português – Brasil
- Tiếng Việt
- Türkçe
- Русский
- עברית
- العربيّة
- فارسی
- हिंदी
- বাংলা
- ภาษาไทย
- 中文 – 简体
- 中文 – 繁體
- 日本語
- 한국어

Sign in

- [Articles](https://web.dev/articles)

[![web.dev](https://www.gstatic.com/devrel-devsite/prod/v5be16d8c9f9402e54c2da2ff24cb75c148f5d2bc84c6f8dfc8b9e16ae456160b/web/images/lockup.svg)](/)

- Resources
  - More
- [Discover](/discover)
- [Baseline](/baseline)
- [How to use Baseline](/how-to-use-baseline)
- [Blog](/blog)
- [Case Studies](/case-studies)

- Web Platform
- [HTML](/html)
- [CSS](/css)
- [JavaScript](/javascript)
- User experience
- [Performance](/performance)
- [Accessibility](/accessibility)
- [Identity](/identity)
- Learn
- [Learn HTML](/learn/html)
- [Learn CSS](/learn/css)
- [Learn JavaScript](/learn/javascript)
- [Learn AI](/learn/ai)
- [Learn Performance](/learn/performance)
- [Learn Accessibility](/learn/accessibility)
- [More courses](/learn)
- Additional resources
- [AI and the web](/explore/ai)
- [Explore](/explore)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [Podcasts &amp; shows](/shows)
- [Developer Newsletter](/newsletter)
- [About web.dev](/about)

- [Home](https://web.dev/)
- [Articles](https://web.dev/articles)

# Best Practices for Persisting Application State with IndexedDB Stay organized with collections Save and categorize content based on your preferences.

Learn best practices for syncing application state between IndexedDB and popular
state management libraries.

![Philip Walton](https://web.dev/images/authors/philipwalton.jpg)

Philip Walton

[X](https://twitter.com/philwalton) [GitHub](https://github.com/philipwalton)
[LinkedIn](https://www.linkedin.com/in/waltonphilip)
[Mastodon](https://toot.cafe/%40philipwalton)
[Bluesky](https://bsky.app/profile/philipwalton.com)
[Homepage](https://philipwalton.com/)

When a user first loads a website or application, there's often a fair amount of
work involved in constructing the initial application state that's used to
render the UI. For example, sometimes the app needs to authenticate the user
client-side and then make several API requests before it has all the data it
needs to display on the page.

Storing the application state in
[IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API) can be a
great way to speed up the load time for repeat visits. The app can then sync up
with any API services in the background and update the UI with new data lazily,
employing a
[stale-while- revalidate](https://www.mnot.net/blog/2007/12/12/stale) strategy.

However, when using IndexedDB there are many important things to consider that
may not be immediately obvious to developers new to the APIs. This document
answers common questions and discusses some of the most important things to keep
in mind when persisting application state in IndexedDB.

**Note:** this document focuses specifically on persisting application state
data, that is, the data needed to render the user interface. The advice
presented here doesn't necessarily apply to all types of data you might want to
store.

## Keep your app predictable

A lot of the complexities around IndexedDB stem from the fact that there are so
many factors you (the developer) have no control over. This section explores
many of the issues you must keep in mind when working with IndexedDB.

### Writes to storage may fail

Errors when writing to IndexedDB can happen for a variety of reasons, and in
some cases these reasons are outside of your control as a developer. For
example, some browsers don't allow
[writing to IndexedDB when in private
browsing mode](https://developer.mozilla.org/docs/Web/API/IndexedDB_API#Browser_compatibility).
There's also the possibility that a user is on a device that's almost out of
disk space, and the browser will restrict you from storing anything at all.

Because of this, it's critically important that you always implement proper
error handling in your IndexedDB code. This also means it's generally a good
idea to keep application state in memory (in addition to storing it), so the UI
doesn't break when running in private browsing mode or when storage space isn't
available (even if some of the other app features that require storage won't
work).

### Stored data may have been modified or deleted by the user

Unlike server-side databases where you can restrict unauthorized access,
client-side databases are accessible to browser extensions and developer tools,
and they can be cleared by the user.

While it may be uncommon for users to modify their locally stored data, it's
quite common for users to clear it. It's important that your application can
handle both of these cases without erroring.

### Stored data may be out of date

Similar to the previous section, even if the user hasn't modified the data
themselves, it's also possible that the data they have in storage was written by
an earlier version of your code, possibly a version with bugs in it.

IndexedDB has built-in support for schema versions and upgrading using its
[`IDBOpenDBRequest.onupgradeneeded()`](https://developer.mozilla.org/docs/Web/API/IDBOpenDBRequest/onupgradeneeded)
method; however, you still need to write your upgrade code in such a way that it
can handle the user coming from a previous version (including a version with a
bug).

Unit tests can be very helpful here, as it's often not feasible to manually test
all possible upgrade paths and cases.

## Keep your app performant

One of the key features of IndexedDB is its asynchronous API, but don't let that
fool you into thinking you don't need to worry about performance when using it.
There are a number of cases where improper usage can still block the main
thread, which can lead to unresponsiveness.

As a general rule, reads and writes to IndexedDB shouldn't be larger than
required for the data being accessed.

While IndexedDB makes is possible to store large, nested objects as a single
record (and doing so is admittedly quite convenient from a developer
perspective), this practice should be avoided. The reason is because when
IndexedDB stores an object, it must first create a
[structured clone](https://developer.mozilla.org/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
of that object, and the structured cloning process happens on the main thread.
The larger the object, the longer the blocking time will be.

This presents some challenges when planning how to persist application state to
IndexedDB, as most of the popular state management libraries (like
[Redux](http://redux.js.org/)) work by managing your entire state tree as a
single JavaScript object.

While managing state in this way has many benefits, and while storing the entire
state tree as a single record in IndexedDB may be tempting and convenient, doing
this after every change (even if throttled/debounced) will result in unnecessary
blocking for of the main thread, it will increase the likelihood of write
errors, and in some cases it will even cause the browser tab to crash or become
unresponsive.

Instead of storing the entire state tree in a single record, you should break it
up into individual records and only update the records that actually change.

As with most best practices, this is not an all-or-nothing rule. In cases where
it's not feasible to break up a state object and just write the minimal
change-set, breaking up the data into sub-trees and only writing those is still
preferable to always writing the entire state tree. Little improvements are
better than no improvements at all.

Lastly, you should always be
[measuring the performance impact](/articles/user-centric-performance-metrics)
of the code you write. While it's true that small writes to IndexedDB will
perform better than large writes, this only matters if the writes to IndexedDB
that your application is doing actually lead to
[long tasks](/web/updates/2017/06/user-centric-%0Aperformance-metrics#long_tasks)
that block the main thread and degrade the user experience. It's important to
measure so you understand what you're optimizing for.

## Conclusions

Developers can use client storage mechanisms like IndexedDB to improve the user
experience of their application by not only persisting state across sessions but
also by decreasing the time it takes to load the initial state on repeat visits.

While using IndexedDB properly can dramatically improve user experience, using
it incorrectly or failing to handle error cases can lead to broken apps and
unhappy users.

Since client storage involves many factors outside of your control, it's
critical your code is well tested and properly handles errors, even those that
may initially seem unlikely to occur.

Except as otherwise noted, the content of this page is licensed under the
[Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/),
and code samples are licensed under the
[Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details,
see the
[Google Developers Site Policies](https://developers.google.com/site-policies).
Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2017-06-08 UTC.

[[["Easy to understand","easyToUnderstand","thumb-up"],["Solved my
problem","solvedMyProblem","thumb-up"],["Other","otherUp","thumb-up"]],[["Missing
the information I need","missingTheInformationINeed","thumb-down"],["Too
complicated / too many steps","tooComplicatedTooManySteps","thumb-down"],["Out
of date","outOfDate","thumb-down"],["Samples / code
issue","samplesCodeIssue","thumb-down"],["Other","otherDown","thumb-down"]],["Last
updated 2017-06-08 UTC."],[],[]]

- ### web.dev

  - ### web.dev

    We want to help you build beautiful, accessible, fast, and secure websites
    that work cross-browser, and for all of your users. This site is our home
    for content to help you on that journey, written by members of the Chrome
    team, and external experts.
- ### Contribute

  - [File a bug](https://issuetracker.google.com/issues/new?component=1400680&template=1857359)
  - [See open issues](https://issuetracker.google.com/issues?q=status:open%20componentid:1400680&s=created_time:desc)
- ### Related Content

  - [Chrome for Developers](https://developer.chrome.com/)
  - [Chromium updates](https://blog.chromium.org/)
  - [Case studies](/case-studies)
  - [Podcasts & shows](/shows)
- ### Follow

  - [@ChromiumDev on X](https://twitter.com/ChromiumDev)
  - [YouTube](https://www.youtube.com/user/ChromeDevelopers)
  - [Chrome for Developers on LinkedIn](https://www.linkedin.com/showcase/chrome-for-developers)
  - [RSS](/static/blog/feed.xml)

- [Terms](//policies.google.com/terms)
- [Privacy](//policies.google.com/privacy)
- Manage cookies

- English
- Deutsch
- Español – América Latina
- Français
- Indonesia
- Italiano
- Polski
- Português – Brasil
- Tiếng Việt
- Türkçe
- Русский
- עברית
- العربيّة
- فارسی
- हिंदी
- বাংলা
- ภาษาไทย
- 中文 – 简体
- 中文 – 繁體
- 日本語
- 한국어
