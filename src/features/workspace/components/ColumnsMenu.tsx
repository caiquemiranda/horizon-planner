import { Columns3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { COLUMNS, REQUIRED_COLUMNS } from '../lib/columns';
import { useWorkspaceUiStore } from '../store/workspaceUiStore';

/** Shows or hides table columns and restores the default layout (remembered per project). */
export function ColumnsMenu() {
  const hiddenColumns = useWorkspaceUiStore((state) => state.hiddenColumns);
  const toggleColumn = useWorkspaceUiStore((state) => state.toggleColumn);
  const resetColumns = useWorkspaceUiStore((state) => state.resetColumns);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Colunas da tabela">
          <Columns3 />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-label">Colunas</DropdownMenuLabel>
        {COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={!hiddenColumns.includes(column.key)}
            disabled={REQUIRED_COLUMNS.includes(column.key)}
            onSelect={(event) => {
              // Keep the menu open to toggle several columns.
              event.preventDefault();
            }}
            onCheckedChange={() => {
              toggleColumn(column.key);
            }}
          >
            {column.ariaLabel ?? column.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={resetColumns}>Restaurar colunas e larguras</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
