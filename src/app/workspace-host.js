export function resolveWorkspaceRenderer(session, renderers) {
  const component = session.workspaceDescriptor.component;
  const kind = session.workspaceSnapshot.kind;
  const renderer = renderers[component] ?? renderers[kind];

  if (!renderer) {
    throw new RangeError(`No workspace renderer registered for ${component} (${kind})`);
  }

  return renderer;
}

export function renderWorkspaceHost({ session, renderers, target, onSessionChange }) {
  const renderer = resolveWorkspaceRenderer(session, renderers);
  const render = typeof renderer === 'function' ? renderer : renderer.render;
  if (typeof render !== 'function') {
    throw new TypeError('workspace renderer must be a function or expose a render function');
  }
  target.replaceChildren();
  render({ session, target, onSessionChange });
}
