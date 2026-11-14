/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "696166f35f564a2ccc998889bebb4b10"
  }, {
    "url": "pwa-512x512.png",
    "revision": "e39d647c05bb248f9c38862be896d1bb"
  }, {
    "url": "pwa-192x192.png",
    "revision": "aae9edae4116e9b1b931e5e0f14ca670"
  }, {
    "url": "orientra-logo.jpeg",
    "revision": "3a9cc8ab1bd0f8cf146c17ce75d862d4"
  }, {
    "url": "index.html",
    "revision": "5c12b3150e69b151d5976be64af6116a"
  }, {
    "url": "icon.svg",
    "revision": "ebb1b56e78a40d9610f8974a53f189f7"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "aec4d193bf8dfaac8b6cce066d10378c"
  }, {
    "url": "assets/index-zAyDjGS8.js",
    "revision": null
  }, {
    "url": "assets/index-35AHCDVL.css",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "aec4d193bf8dfaac8b6cce066d10378c"
  }, {
    "url": "icon.svg",
    "revision": "ebb1b56e78a40d9610f8974a53f189f7"
  }, {
    "url": "orientra-logo.jpeg",
    "revision": "3a9cc8ab1bd0f8cf146c17ce75d862d4"
  }, {
    "url": "pwa-192x192.png",
    "revision": "aae9edae4116e9b1b931e5e0f14ca670"
  }, {
    "url": "pwa-512x512.png",
    "revision": "e39d647c05bb248f9c38862be896d1bb"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "696166f35f564a2ccc998889bebb4b10"
  }, {
    "url": "manifest.webmanifest",
    "revision": "8d79449d111b2a9c7b1e1f58ae948c7f"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//]
  }));

}));
