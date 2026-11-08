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
    "url": "index.html",
    "revision": "25cb8b17398bca087370bcaff958661f"
  }, {
    "url": "icon.svg",
    "revision": "ebb1b56e78a40d9610f8974a53f189f7"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "aec4d193bf8dfaac8b6cce066d10378c"
  }, {
    "url": "assets/index-dubKOhSZ.css",
    "revision": null
  }, {
    "url": "assets/index-CnF50pif.js",
    "revision": null
  }, {
    "url": "assets/aistudio/result_c44c58f8.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-08_at_21.15.41_17f1ae3a.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-08_at_20.11.44_fda464b9.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_19.20.55_ac1cdd63.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_16.41.34_ccc7b3d2.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_06.14.58_a5fe7e03.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_05.17.07_8bdc916a.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_05.14.46_bda25ae0.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_05.03.20_4cd20041.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_04.32.16_08a04606.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-03_at_10.54.17_f2f32a16.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-03_at_10.09.56_bc5b9331.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-02_at_10.23.44_9c626036.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-02_at_08.40.28_57eef0be.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-02_at_08.40.22_fcb7196a.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-02_at_07.55.52_5e8f6d1f.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-10-31_at_06.21.15_5f1048ce.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "aec4d193bf8dfaac8b6cce066d10378c"
  }, {
    "url": "icon.svg",
    "revision": "ebb1b56e78a40d9610f8974a53f189f7"
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
    "revision": "89abe0bf106f4fabbc345087530acbf4"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//]
  }));

}));
