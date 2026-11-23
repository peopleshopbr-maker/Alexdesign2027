import { Box, Eye, EyeOff, ListTree, Trash2, X } from 'lucide-react';
import type { SceneOutlinerItem } from '../types/graphics';

interface SceneOutlinerPanelProps {
  items: SceneOutlinerItem[];
  selectedUuid: string | null;
  hasSelection: boolean;
  onSelectItem: (uuid: string) => void;
  onToggleVisibility: (uuid: string) => void;
  onDeleteItem: (uuid: string) => void;
  onSwitchToInspector: () => void;
  onClose: () => void;
}

export function SceneOutlinerPanel({
  items,
  selectedUuid,
  hasSelection,
  onSelectItem,
  onToggleVisibility,
  onDeleteItem,
  onSwitchToInspector,
  onClose,
}: SceneOutlinerPanelProps) {
  return (
    <aside
      aria-label="Outliner da Cena 3D"
      className="fixed left-12 right-2 bottom-[66px] max-h-[58dvh] md:left-auto md:top-[68px] md:right-4 md:bottom-auto md:w-80 md:max-h-[calc(100dvh-13rem)] z-20 overflow-hidden bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 shadow-2xl flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <ListTree className="w-4 h-4 text-sky-400 shrink-0" />
          <h2 className="text-xs font-bold tracking-wide text-white uppercase truncate">
            Cena ({items.length})
          </h2>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <button
              type="button"
              onClick={onSwitchToInspector}
              className="h-7 px-2 text-[11px] font-medium rounded-lg bg-[#090c13] hover:bg-[#141c2b] text-sky-300 border border-sky-400/35 cursor-pointer"
            >
              Objeto
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Outliner"
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">
          Nenhuma malha editável neste modo.
        </p>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto pr-0.5 max-h-[42dvh] md:max-h-[calc(100dvh-19rem)]">
          {items.map((item) => {
            const active = item.uuid === selectedUuid;
            return (
              <div
                key={item.uuid}
                className={`h-9 px-2 rounded-lg border flex items-center justify-between gap-1.5 ${
                  active
                    ? 'bg-sky-500/18 border-sky-400/50 text-white'
                    : 'bg-[#090c13] border-white/8 text-slate-300 hover:bg-[#141b29]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectItem(item.uuid)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                >
                  <Box
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active ? 'text-sky-300' : 'text-slate-500'
                    }`}
                  />
                  <span className="text-xs font-medium truncate">{item.name}</span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-500 ml-auto shrink-0">
                    {item.triangles}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleVisibility(item.uuid)}
                  title={item.visible ? 'Ocultar objeto' : 'Mostrar objeto'}
                  aria-label={item.visible ? 'Ocultar objeto' : 'Mostrar objeto'}
                  className="w-6 h-6 rounded-md text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  {item.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onDeleteItem(item.uuid)}
                  title="Excluir objeto (Delete)"
                  aria-label="Excluir objeto"
                  className="w-6 h-6 rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-500/15 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
