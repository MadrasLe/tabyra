import type { BrowserContext, CDPSession, Page } from 'playwright-core';

export async function readSnapshot(context: BrowserContext, page: Page, prefix: string, args: Record<string, unknown>) {
  const limit = (key: string, fallback: number, maximum: number) => {
    const value = args[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${key} deve ser inteiro de 1 a ${maximum}.`);
    return value;
  };
  const maxElements = limit('maxElements', 100, 250), maxTextLength = limit('maxTextLength', 12000, 24000);
  if (args.selector !== undefined && (typeof args.selector !== 'string' || args.selector.length > 1000)) throw new Error('selector deve ser CSS com até 1.000 caracteres.');
  let cdp: CDPSession | undefined;
  let timer: NodeJS.Timeout | undefined;
  let expired = false;
  const timeoutMs = 3000;
  const operation = (async () => {
    cdp = await context.newCDPSession(page);
    if (expired) throw new Error('Leitura expirada.');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    if (expired) throw new Error('Leitura expirada.');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'elektron-snapshot', grantUniveralAccess: false });
    if (expired) throw new Error('Leitura expirada.');
    const read = ({ prefix, selector, maxElements, maxTextLength }: { prefix: string; selector?: string; maxElements: number; maxTextLength: number }) => {
      const started = performance.now();
      let visited = 0, truncated = false;
      // TreeWalker stays incremental on large pages. Each open shadow root is
      // visited where its host occurs, so inner controls keep their DOM order.
      function* walk(root: Element): Generator<Element> {
        const stack = [{ walker: document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT), next: root as Element | null }];
        while (stack.length) {
          const frame = stack[stack.length - 1], el = frame.next;
          if (!el) { stack.pop(); continue; }
          if (++visited > 10000 || performance.now() - started > 400) { truncated = true; return; }
          frame.next = frame.walker.nextNode() as Element | null;
          yield el;
          if (el.shadowRoot) {
            const walker = document.createTreeWalker(el.shadowRoot, NodeFilter.SHOW_ELEMENT);
            stack.push({ walker, next: walker.nextNode() as Element | null });
          }
        }
      }
      let root: Element | null = document.body;
      if (selector) {
        root = null;
        for (const el of walk(document.documentElement)) if (el.matches(selector)) { root = el; break; }
      }
      if (!root) throw new Error('Área do snapshot não encontrada. Confira o seletor CSS.');
      const interactive = 'a[href],button,input,textarea,select,[role="button"],[role="link"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="tab"],[role="textbox"],[role="combobox"],[contenteditable="true"],[tabindex],.monaco-editor,.cm-editor,.CodeMirror';
      const elements = [];
      let text = ((root as HTMLElement).innerText || root.textContent || '').slice(0, maxTextLength);
      for (const el of walk(root)) {
        if (elements.length >= maxElements || performance.now() - started > 400) { truncated = true; break; }
        if (el.parentNode instanceof ShadowRoot && text.length < maxTextLength && !el.matches('script,style,noscript,template')) {
          const content = (el as HTMLElement).innerText || '';
          if (content.trim()) text = (text + '\n' + content).slice(0, maxTextLength);
        }
        if (!el.matches(interactive)) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const css = getComputedStyle(el);
        if (css.visibility === 'hidden' || css.display === 'none') continue;
        const ref: string = `${prefix}e${elements.length + 1}`;
        el.setAttribute('data-elektron-ref', ref);
        const field = el as HTMLInputElement;
        const label = el.getAttribute('aria-label') || el.getAttribute('title') || field.labels?.[0]?.textContent || field.placeholder || el.textContent || '';
        elements.push({ ref, tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), name: label.trim().slice(0, 200),
          bounds: { x: box.x, y: box.y, width: box.width, height: box.height }, type: field.type || undefined, disabled: !!field.disabled || el.getAttribute('aria-disabled') === 'true',
          checked: el.hasAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'mixed' ? 'mixed' : el.getAttribute('aria-checked') === 'true' : field.type === 'checkbox' || field.type === 'radio' ? field.checked : undefined,
          expanded: el.hasAttribute('aria-expanded') ? el.getAttribute('aria-expanded') === 'true' : undefined,
          href: el instanceof HTMLAnchorElement ? el.href : undefined });
      }
      return { title: document.title, url: location.href, text, elements, truncated };
    };
    const result = await cdp.send('Runtime.evaluate', { expression: `(${read.toString()})(${JSON.stringify({ prefix, selector: args.selector, maxElements, maxTextLength })})`,
      contextId: executionContextId, returnByValue: true, timeout: 2000, silent: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    if (!result.result.value) throw new Error('A página não devolveu o snapshot.');
    return result.result.value as { title: string; url: string; text: string; truncated: boolean; elements: { ref: string; tag: string; name: string; bounds: { x: number; y: number; width: number; height: number } }[] };
  })().finally(() => { if (expired && cdp) void cdp.detach().catch(() => {}); });
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('Snapshot não respondeu em 3 s. As abas foram preservadas. Tente uma área menor com selector ou use browser_screenshot; não reinicie o processo.')); }, timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
    // Extra CDP sessions are aliases in connected Chrome; do not let their
    // cleanup hold the action queue if a transport has stopped responding.
    if (cdp) void cdp.detach().catch(() => {});
  }
}
