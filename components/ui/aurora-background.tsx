'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

// Client-only: the component builds a WebGL context on mount.
const SoftAurora = dynamic(() => import('./soft-aurora'), { ssr: false });

/*
  AuroraBackground — the app's living backdrop.

  Mounted ONCE in app/layout.tsx, outside AppShell, so navigating between routes
  never tears down and rebuilds the GL context.

  Two layers:
    1. `.aurora-static` — a CSS radial-gradient field in the same colors. This
       is the first paint (no WebGL warm-up flash) AND the complete fallback.
    2. the GL canvas on top, `mix-blend-mode: multiply`.

  Why multiply: the shader ADDS light. On a light page, white + pink light is
  still white, so an additive aurora is invisible. Multiplying makes the bands
  darken the rose-milk base into pink and peach washes instead.

  Stacking: this sits at z-0 and all app content is wrapped in `relative z-10`.
  It deliberately does NOT use a negative z-index — a canvas at z-index:-1 inside
  <body> paints behind body's own background and vanishes.

  The canvas is skipped entirely (static gradient only) when the user prefers
  reduced motion, or when WebGL is unavailable.
*/
export function AuroraBackground() {
  const [live, setLive] = React.useState(false);

  React.useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    function supportsWebGL(): boolean {
      try {
        const canvas = document.createElement('canvas');
        return Boolean(
          canvas.getContext('webgl2') ??
            canvas.getContext('webgl') ??
            canvas.getContext('experimental-webgl'),
        );
      } catch {
        return false;
      }
    }

    function sync() {
      setLive(!motionQuery.matches && supportsWebGL());
    }

    sync();
    motionQuery.addEventListener('change', sync);
    return () => motionQuery.removeEventListener('change', sync);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-cream"
    >
      <div className="aurora-static absolute inset-0" />
      {live && (
        <div className="aurora-blend absolute inset-0">
          <SoftAurora
            speed={0.45}
            scale={1.6}
            brightness={1.15}
            color1="#fad5bb"
            color2="#f493be"
            noiseFrequency={2.2}
            noiseAmplitude={1}
            bandHeight={0.55}
            bandSpread={1.1}
            octaveDecay={0.12}
            layerOffset={2.5}
            colorSpeed={0.7}
            enableMouseInteraction={false}
            mouseInfluence={0}
          />
        </div>
      )}
    </div>
  );
}
