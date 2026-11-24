import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadProjectSpreadsheet } from '@/features/data-io/lib/spreadsheetDownloads';
import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useScheduleStore } from '@/features/schedule/store';
import type { Project } from '@/types/project';

/**
 * "Exportar": the whole project as an Excel workbook (tasks, links, calendar, metadata) or
 * its tasks as CSV. Every task is included, collapsed or filtered ones too.
 */
export function ExportMenu({ project }: { project: Project }) {
  const schedule = useScheduleStore((state) => state.schedule);
  const result = useScheduleStore((state) => state.result);
  const showNotice = useNoticeStore((state) => state.show);
  const ready = schedule !== null && result !== null && schedule.projectId === project.id;

  const exportAs = async (format: 'xlsx' | 'csv') => {
    if (!schedule || !result) return;
    try {
      await downloadProjectSpreadsheet(format, project, schedule, result);
      showNotice(
        format === 'xlsx'
          ? 'Planilha Excel gerada com todas as tarefas, vínculos e o calendário.'
          : 'CSV gerado com as tarefas. Vínculos ficam na coluna “predecessoras”; o calendário não vai no CSV.',
      );
    } catch {
      showNotice('Não foi possível gerar o arquivo. Tente novamente.', 'error');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={!ready}>
          <FileDown />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-label">Exportar projeto</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            void exportAs('xlsx');
          }}
        >
          <FileSpreadsheet />
          Excel (.xlsx) — completo
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void exportAs('csv');
          }}
        >
          <FileText />
          CSV (.csv) — só tarefas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
