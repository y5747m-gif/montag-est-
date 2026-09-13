/**
 * اختصارات لوحة المفاتيح — مشابهة لأفتر إفكتس
 */

const TOOL_KEYS = {
  v: 'select', h: 'hand', z: 'zoom', w: 'rotate', y: 'pan-behind',
  q: 'rect', e: 'ellipse', r: 'pen', t: 'text', g: 'pen',
};

const PROP_KEYS = {
  p: 'transform.position', a: 'transform.anchor', s: 'transform.scale',
  r: 'transform.rotation', t: 'transform.opacity',
};

export function installShortcuts(app) {
  const isTyping = (el) => {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') { e.preventDefault(); app.showShortcuts(); return; }
    if (isTyping(e.target)) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const store = app.store;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;

    /* ---------- مع Ctrl ---------- */
    if (mod) {
      switch (lower) {
        case 'z':
          e.preventDefault();
          e.shiftKey ? store.redo() : store.undo();
          return;
        case 'y': e.preventDefault(); store.redo(); return;
        case 'c': e.preventDefault(); store.copySelection(); return;
        case 'x': e.preventDefault(); store.cutSelection(); return;
        case 'v': e.preventDefault(); store.pasteLayers({ atFrame: store.playhead }); return;
        case 'd': e.preventDefault(); store.duplicateLayers(store.selection.layerIds); return;
        case 'a': e.preventDefault(); store.selectAll(); return;
        case 'k': if (!e.shiftKey) { e.preventDefault(); app.newComposition(); return; } break;
        case 'y': break;
        case 's': e.preventDefault(); store.saveToFile(); return;
        case 'o': if (e.shiftKey) { e.preventDefault(); app.openProjectFile(); } return;
        case 'n': e.preventDefault(); app.newProject(); return;
        case 'i': e.preventDefault(); app.openImportDialog(); return;
        case 'e': e.preventDefault(); app.exportDialog(); return;
        case 'u': break;
        case '/': e.preventDefault(); document.body.classList.toggle('zen'); setTimeout(() => app.viewer.layout(), 30); return;
        case '0': e.preventDefault(); app.viewer.fit(); return;
        case '9': e.preventDefault(); app.viewer.setZoom(1); return;
        default: break;
      }
      if (e.shiftKey && lower === 'd') { e.preventDefault(); store.splitLayersAt(store.playhead); return; }
      if (e.shiftKey && lower === 'e') { e.preventDefault(); app.exportDialog(); return; }
      if (e.shiftKey && lower === 'k') { e.preventDefault(); app.createLayerOfType('solid'); return; }
      if (e.shiftKey && e.altKey && lower === 't') { e.preventDefault(); app.createLayerOfType('text'); return; }
      return;
    }

    /* ---------- Shift ---------- */
    if (e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
      e.preventDefault();
      const step = key === 'ArrowUp' ? [0, -10] : key === 'ArrowDown' ? [0, 10] : key === 'ArrowLeft' ? [-10, 0] : [10, 0];
      store.nudgeSelected(step[0], step[1]);
      return;
    }

    /* ---------- مفاتيح عادية ---------- */
    switch (key) {
      case ' ': e.preventDefault(); app.viewer.togglePlay(); return;
      case 'Home': e.preventDefault(); store.gotoStart(); app.timeline.rebuild(); return;
      case 'End': e.preventDefault(); store.gotoEnd(); app.timeline.rebuild(); return;
      case 'PageUp': e.preventDefault(); store.stepFrame(e.shiftKey ? -10 : -1); app.timeline.updatePlayhead(); return;
      case 'PageDown': e.preventDefault(); store.stepFrame(e.shiftKey ? 10 : 1); app.timeline.updatePlayhead(); return;
      case 'ArrowLeft': e.preventDefault(); store.stepFrame(-1); app.timeline.updatePlayhead(); return;
      case 'ArrowRight': e.preventDefault(); store.stepFrame(1); app.timeline.updatePlayhead(); return;
      case 'ArrowUp': case 'ArrowDown':
        e.preventDefault();
        app.moveSelection(key === 'ArrowUp' ? -1 : 1);
        return;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        if (store.selection.props.length) store.deleteAnimation(...store.selection.props[0].split('::'));
        else if (store.selection.layerIds.length) store.removeLayers(store.selection.layerIds);
        return;
      case 'Escape':
        app.viewer.cancelCurrent();
        store.clearPropSelection();
        return;
      case '[': e.preventDefault(); store.selection.layerIds.forEach((id) => store.setLayerTime(id, { inPoint: store.playhead })); return;
      case ']': e.preventDefault(); store.selection.layerIds.forEach((id) => store.setLayerTime(id, { outPoint: store.playhead })); return;
      case '+': case '=': e.preventDefault(); app.viewer.setZoom(app.viewer.zoom * 1.25); return;
      case '-': case '_': e.preventDefault(); app.viewer.setZoom(app.viewer.zoom / 1.25); return;
      default: break;
    }

    /* ---------- حروف ---------- */
    if (lower === 'j' || lower === 'k' || lower === 'l') {
      if (lower === 'k') { app.viewer.stop(); return; }
      const dir = lower === 'j' ? -1 : 1;
      e.preventDefault();
      app.viewer.play({ fromFrame: store.playhead, rate: dir });
      return;
    }
    if (lower === 'u') { app.toggleAnimatedOnly(); return; }
    if (lower === 'm') {
      const ids = store.selection.layerIds.length ? store.selection.layerIds : [];
      ids.forEach((id) => store.addMask(id));
      return;
    }
    if (PROP_KEYS[lower]) { app.selectPropertyShortcut(PROP_KEYS[lower]); return; }
    if (TOOL_KEYS[lower]) { app.setTool(TOOL_KEYS[lower]); return; }
  });

  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    app.viewer.setZoom(app.viewer.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });

  window.addEventListener('resize', () => app.viewer.layout());
}
