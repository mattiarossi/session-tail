/** the ellipsis that ends a collapsed burst, and the control that ends an expanded one */
export function FoldRow({ hidden, onClick }: { hidden: number | null; onClick: () => void }) {
  return (
    <div className="flex select-none items-center gap-2 px-2">
      <span className="w-[10ch] shrink-0" />
      <button onClick={onClick} className="text-[11px] text-blue-700 hover:underline">
        {hidden === null ? '▴ collapse' : `… ${hidden} more line${hidden === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
