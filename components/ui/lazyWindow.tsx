"use client";

import { useEffect, useState, type ComponentType } from "react";

// A window opened on a click (the post editor, Share), loaded when it's
// first opened rather than with the page. Not next/dynamic: its Suspense
// took a just-opened window down and put it straight back up, which ran
// Modal's closing animation over the open window (a second copy on screen
// for a moment). This renders nothing until the code is here, then the
// window once. After the first time it's at hand straight away.
//
// preload fetches the code without showing anything (useWarmUp, once the
// page has settled), so a click usually finds it already loaded.
export function lazyWindow<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () => {
    pending ??= load().then(
      (c) => (loaded = c),
      (e) => {
        // A failed download can be tried again on the next open.
        pending = null;
        throw e;
      },
    );
    return pending;
  };

  function LazyWindow(props: P) {
    const [Window, setWindow] = useState<ComponentType<P> | null>(() => loaded);
    useEffect(() => {
      if (Window) return;
      let live = true;
      preload().then(
        (c) => live && setWindow(() => c),
        () => {},
      );
      return () => {
        live = false;
      };
    }, [Window]);
    return Window ? <Window {...props} /> : null;
  }

  return Object.assign(LazyWindow, { preload });
}
