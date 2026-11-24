import { useEffect, useState } from 'react';
import { useSystemStore } from '../stores/SystemStore';

export function CommandPalette() {
  const { isCommandPaletteOpen: open, setCommandPaletteOpen: setOpen, toggleCommandPalette: toggle, quickActions, undo, redo, past, future } = useSystemStore();
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'F3' || (mod && e.key.toLowerCase() === 'k')) { e.preventDefault(); toggle(); return; }
      if (e.key === 'Escape' && open) { setOpen(false); return; }
      if (/INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName)) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen, toggle, undo, redo]);

  if (!open) return null;

  const items = [
    { id: 'undo', label: `Desfazer (${past.length})`, category: 'Edição', shortcut: 'Ctrl+Z', run: undo },
    { id: 'redo', label: `Refazer (${future.length})`, category: 'Edição', shortcut: 'Ctrl+Y', run: redo },
    ...quickActions,
  ].filter((a) => !q || `${a.label} ${a.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && items[0] && (setOpen(false), items[0].run())} placeholder="Comando rápido (F3)..." className="w-full border-b border-zinc-800 bg-transparent px-2 py-2 text-sm focus:outline-none" />
        <div className="mt-1 max-h-64 overflow-y-auto">
          {items.map((it) => (
            <button key={it.id} onClick={() => { setOpen(false); it.run(); }} className="flex w-full justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-zinc-800">
              <span>{it.label}</span>
              <span className="text-zinc-500">{it.shortcut ?? it.category}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

