import type { CDPSession, Page } from 'playwright-core';

/** Monaco's typing path reindents newlines. Prefer its public edit API, with
 * exact readback, instead of typing or clipboard-dependent paste providers. */
export async function insertEditorText(page: Page, text: string) {
  const detect = () => {
    let focused: Element | null = document.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    let node = focused, monaco = false;
    while (node) {
      if (node.closest('.monaco-editor')) { monaco = true; break; }
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return monaco && !!focused;
  };
  // This fixed internal function runs in the page's main world to access only
  // the public Monaco API. User-supplied JavaScript remains isolated; text is
  // passed as JSON data, never evaluated as source.
  const edit = (text: string) => {
    const api = (globalThis as unknown as { monaco?: { editor?: { getEditors?: () => any[] } } }).monaco?.editor;
    let focused: Element | null = document.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    const matches = typeof api?.getEditors === 'function' ? api.getEditors().filter(editor => editor.getDomNode()?.contains(focused)) : [];
    if (matches.length !== 1) throw new Error('O Monaco focado não expõe uma instância pela API pública. Nenhum texto foi inserido. Não repita por digitação nem Base64; informe esta limitação de integração.');
    const editor = matches[0], model = editor.getModel(), ranges = editor.getSelections();
    if (!model || ranges?.length !== 1) throw new Error('Foque uma única seleção no editor Monaco antes de inserir código.');
    if (editor.getRawOptions().readOnly) throw new Error('A célula Monaco está em modo somente leitura. Nenhum texto foi inserido.');
    const range = ranges[0], before = model.getValue();
    const start = model.getOffsetAt(range.getStartPosition()), end = model.getOffsetAt(range.getEndPosition());
    const normalized = text.replace(/\r\n|\r|\n/g, model.getEOL());
    const expected = before.slice(0, start) + normalized + before.slice(end);
    editor.pushUndoStop();
    if (!editor.executeEdits('elektron', [{ range, text: normalized, forceMoveMarkers: true }])) throw new Error('O editor recusou a edição. Confira se a célula permite edição.');
    editor.pushUndoStop();
    if (model.getValue() !== expected) throw new Error('O conteúdo do Monaco mudou durante a inserção e não corresponde ao bloco enviado. Confira a célula antes de executar ou repetir.');
    editor.setPosition(model.getPositionAt(start + normalized.length));
    return true;
  };
  let cdp: CDPSession | undefined, timer: NodeJS.Timeout | undefined, expired = false;
  const operation = (async () => {
    cdp = await page.context().newCDPSession(page);
    if (expired) throw new Error('Inserção expirada.');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    if (expired) throw new Error('Inserção expirada.');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'elektron-editor-input', grantUniveralAccess: false });
    if (expired) throw new Error('Inserção expirada.');
    const response = await cdp.send('Runtime.evaluate', { expression: `(${detect.toString()})()`, contextId: executionContextId, returnByValue: true, timeout: 2000, silent: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    if (typeof response.result.value !== 'boolean') throw new Error('O navegador não confirmou a detecção do editor. Confira o conteúdo antes de repetir.');
    if (!response.result.value) return false;
    if (expired) throw new Error('Inserção expirada.');
    const edited = await cdp.send('Runtime.evaluate', { expression: `(${edit.toString()})(${JSON.stringify(text)})`, returnByValue: true, timeout: 2000, silent: true });
    if (edited.exceptionDetails) throw new Error(edited.exceptionDetails.exception?.description || edited.exceptionDetails.text);
    if (edited.result.value !== true) throw new Error('O editor não confirmou a inserção. Confira o conteúdo antes de repetir.');
    return true;
  })().finally(() => { if (expired && cdp) void cdp.detach().catch(() => {}); });
  let result: boolean;
  try {
    result = await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('O editor não respondeu em 3 s. A aba foi preservada. Confira o conteúdo antes de repetir a inserção; não execute sem conferir.')); }, 3000);
    })]);
  } finally { clearTimeout(timer); if (cdp) void cdp.detach().catch(() => {}); }
  if (result) return { typed: true, input: 'monaco-edit', verified: true };
  await page.keyboard.insertText(text);
  return { typed: true, input: 'native' };
}
