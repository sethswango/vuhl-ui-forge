// Tiny module-level bridge that lets feature components (IteratePane,
// ModelSwitcher) invoke action closures that live in App.tsx without
// requiring those components to be mounted as children of App.
//
// App.tsx registers the current closures in a useEffect on every render so
// the bridge always points at the freshest captures.

export interface IterateActions {
  doUpdate?: (instruction: string) => void;
  regenerate?: () => void;
}

let currentActions: IterateActions = {};

export function registerIterateActions(actions: IterateActions): void {
  currentActions = actions;
}

export function getIterateActions(): IterateActions {
  return currentActions;
}

// Test-only: reset the registry between tests that exercise the bridge.
export function __resetIterateActions(): void {
  currentActions = {};
}
