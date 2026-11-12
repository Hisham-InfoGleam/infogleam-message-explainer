// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// One shared IntersectionObserver for all segments, so a message with
// hundreds of segments does not create hundreds of observers.

const callbacks = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;

/**
 * Call back once when the element comes within about two screens of the
 * visible area. Returns a function that stops watching.
 */
export function whenNearScreen(el: Element, callback: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const done = entry.isIntersecting ? callbacks.get(entry.target) : undefined;
        if (!done) continue;
        callbacks.delete(entry.target);
        observer?.unobserve(entry.target);
        done();
      }
    },
    { rootMargin: '1200px 0px' },
  );
  callbacks.set(el, callback);
  observer.observe(el);
  return () => {
    callbacks.delete(el);
    observer?.unobserve(el);
  };
}
