// Keeps a `--app-height` CSS variable in sync with the real viewport height.
//
// iOS Safari does not reliably recompute `dvh` (or `env(safe-area-inset-*)`)
// on an orientation change — the layout keeps the pre-rotation height until a
// manual reload, which clips the phone-landscape board at the bottom.
// `window.innerHeight` *does* update on rotation, so the phone-landscape layout
// drives its height from this variable (falling back to `100dvh` before this
// runs, which is correct on first load — only rotation is stale).
export function installAppHeight() {
  const update = () => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
  };

  update();

  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => {
    // Right after `orientationchange` iOS can still report the old dimensions
    // for a frame or two; update now and again once the viewport settles.
    update();
    requestAnimationFrame(update);
    setTimeout(update, 300);
  });
  // visualViewport tracks the actually-visible area (toolbars in/out) most
  // accurately where it exists.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
  }
}
