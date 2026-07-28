// Back-compat shim. Navigation now lives in the app shell (Topbar + the
// NavOverlay wheel, mounted by AppShell). Owner pages used to render <Nav /> at
// the top of their content; that role moved to the shell, so this is
// intentionally a no-op to keep those pages compiling until they drop the call.
// New code should NOT use this — the shell provides navigation automatically.
export function Nav() {
  return null;
}
