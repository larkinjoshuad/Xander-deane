import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderWorkspaceHost, resolveWorkspaceRenderer } from '../src/app/workspace-host.js';

test('resolves workspace renderers by descriptor component first', () => {
  const componentRenderer = { render() {} };
  const kindRenderer = { render() {} };
  const session = {
    workspaceDescriptor: { component: 'TokenSelectionWorkspace' },
    workspaceSnapshot: { kind: 'token-selection' },
  };

  assert.equal(
    resolveWorkspaceRenderer(session, {
      TokenSelectionWorkspace: componentRenderer,
      'token-selection': kindRenderer,
    }),
    componentRenderer,
  );
});

test('falls back to workspace kind when no component renderer is registered', () => {
  const kindRenderer = { render() {} };
  const session = {
    workspaceDescriptor: { component: 'UnknownWorkspace' },
    workspaceSnapshot: { kind: 'token-selection' },
  };

  assert.equal(resolveWorkspaceRenderer(session, { 'token-selection': kindRenderer }), kindRenderer);
});

test('renders through workspace host with target replacement', () => {
  const calls = [];
  const target = {
    replaceChildren() {
      calls.push('replaceChildren');
    },
  };
  const session = {
    workspaceDescriptor: { component: 'EqualGroupsWorkspace' },
    workspaceSnapshot: { kind: 'equal-groups' },
  };

  renderWorkspaceHost({
    session,
    target,
    onSessionChange: () => {},
    renderers: {
      EqualGroupsWorkspace: {
        render(args) {
          calls.push(args.session.workspaceSnapshot.kind);
        },
      },
    },
  });

  assert.deepEqual(calls, ['replaceChildren', 'equal-groups']);
});


test('renders function-based workspace renderers', () => {
  const calls = [];
  const target = {
    replaceChildren() {
      calls.push('replaceChildren');
    },
  };
  const session = {
    workspaceDescriptor: { component: 'ClassificationSortWorkspace' },
    workspaceSnapshot: { kind: 'classification-sort' },
  };

  renderWorkspaceHost({
    session,
    target,
    onSessionChange: () => {},
    renderers: {
      ClassificationSortWorkspace(args) {
        calls.push(args.session.workspaceSnapshot.kind);
      },
    },
  });

  assert.deepEqual(calls, ['replaceChildren', 'classification-sort']);
});

test('throws when no workspace renderer is registered', () => {
  assert.throws(() => {
    resolveWorkspaceRenderer(
      { workspaceDescriptor: { component: 'Missing' }, workspaceSnapshot: { kind: 'missing' } },
      {},
    );
  }, RangeError);
});
