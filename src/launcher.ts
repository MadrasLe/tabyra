import * as vscode from 'vscode';
import type { BrowserState } from './core';

export class Launcher implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private changes = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private state?: BrowserState;
  private status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 110);
  constructor() {
    this.status.name = 'Tabyra Browser';
    this.status.command = 'elektron.open';
    this.update();
    this.status.show();
  }
  update(state?: BrowserState) {
    this.state = state;
    this.status.text = '$(globe) Tabyra';
    this.status.tooltip = state?.running ? `Mostrar navegador · ${state.tabs.length} aba(s) · IA ${state.agentEnabled ? 'liberada' : 'pausada'}` : 'Abrir Tabyra Browser ao lado do código';
    this.changes.fire(undefined);
  }
  getTreeItem(item: vscode.TreeItem) { return item; }
  getChildren(parent?: vscode.TreeItem): vscode.TreeItem[] {
    if (parent) return [];
    const item = (label: string, icon: string, command: string, description?: string, args?: unknown[]) => {
      const entry = new vscode.TreeItem(label);
      entry.iconPath = new vscode.ThemeIcon(icon);
      entry.description = description;
      entry.command = { command, title: label, arguments: args };
      return entry;
    };
    const running = this.state?.running;
    const entries = [
      item(running ? 'Mostrar navegador' : 'Abrir navegador', 'globe', 'elektron.open', 'ao lado do código'),
      item('Nova aba', 'add', 'elektron.newTab'),
      item('Conectar IA', 'plug', 'elektron.connect')
    ];
    if (running) entries.push(item(this.state?.agentEnabled ? 'Pausar IA' : 'Retomar IA', this.state?.agentEnabled ? 'debug-pause' : 'play', 'elektron.toggleAgent'));
    for (const tab of this.state?.tabs || []) {
      const selected = tab.id === this.state?.activeId;
      const entry = item(tab.title || (tab.url === 'about:blank' ? 'Nova aba' : tab.url), selected ? 'circle-filled' : 'browser', 'elektron.selectTab', selected ? 'aba ativa' : undefined, [tab.id]);
      entry.tooltip = tab.url;
      entries.push(entry);
    }
    entries.push(item('Configurações', 'settings-gear', 'elektron.settings'));
    return entries;
  }
  dispose() { this.status.dispose(); this.changes.dispose(); }
}
