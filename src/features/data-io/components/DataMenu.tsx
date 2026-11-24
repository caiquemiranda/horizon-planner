import {
  Database,
  Download,
  FileSpreadsheet,
  FileUp,
  FlaskConical,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { IMPORT_HREF } from '@/lib/router';

import { pluralizeProjects, useDataActions } from '../hooks/useDataActions';
import { BackupImportError, type HorizonBackup, readBackupFile } from '../lib/backup';
import { downloadTemplate } from '../lib/spreadsheetDownloads';
import { useNoticeStore } from '../store/noticeStore';

type PendingAction =
  | { kind: 'import'; snapshot: HorizonBackup; fileName: string }
  | { kind: 'sample' }
  | { kind: 'clear' }
  | { kind: 'error'; message: string; details: readonly string[] };

/** Export, import, sample data and "clear all", each replacing data only after confirmation. */
export function DataMenu() {
  const projectCount = useProjectsStore((state) => state.projects.length);
  const { exportBackup, replaceProjects, loadSample, clearAll } = useDataActions();
  const showNotice = useNoticeStore((state) => state.show);
  const inputRef = useRef<HTMLInputElement>(null);
  // Kept after closing so the dialog content does not change during its exit animation.
  const [pending, setPendingState] = useState<PendingAction | null>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);
  // The count when the dialog opened: it drops to 0 while a "clear all" closes it.
  const [countAtOpen, setCountAtOpen] = useState(0);

  const setPending = (action: PendingAction) => {
    setPendingState(action);
    setCountAtOpen(projectCount);
    setDialogOpen(true);
  };

  const importSnapshot = (snapshot: HorizonBackup) =>
    replaceProjects(
      snapshot.projects,
      `Backup importado com ${pluralizeProjects(snapshot.projects.length)}.`,
      snapshot.schedules,
    );

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Reset so picking the same file again still triggers `change`.
    input.value = '';
    if (!file) return;

    try {
      const snapshot = await readBackupFile(file);
      if (projectCount === 0) await importSnapshot(snapshot);
      else setPending({ kind: 'import', snapshot, fileName: file.name });
    } catch (error) {
      if (!(error instanceof BackupImportError)) throw error;
      setPending({ kind: 'error', message: error.message, details: error.details });
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setDialogOpen(false);
    if (pending.kind === 'import') await importSnapshot(pending.snapshot);
    else if (pending.kind === 'sample') await loadSample();
    else if (pending.kind === 'clear') await clearAll();
  };

  const hasProjects = projectCount > 0;

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Dados">
                <Database />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Importar, exportar e dados de exemplo</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-label">Dados</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!hasProjects}
            onSelect={() => {
              void exportBackup();
            }}
          >
            <Download />
            Exportar JSON
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              inputRef.current?.click();
            }}
          >
            <Upload />
            Importar JSON…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              downloadTemplate().catch(() => {
                showNotice('Não foi possível gerar o modelo. Tente novamente.', 'error');
              });
            }}
          >
            <FileSpreadsheet />
            Baixar modelo de EAP (Excel)
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={IMPORT_HREF}>
              <FileUp />
              Importar planilha (Excel/CSV)…
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (hasProjects) setPending({ kind: 'sample' });
              else void loadSample();
            }}
          >
            <FlaskConical />
            Carregar dados de exemplo
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!hasProjects}
            onSelect={() => {
              setPending({ kind: 'clear' });
            }}
          >
            <Trash2 />
            Apagar todos os projetos
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        aria-label="Arquivo de backup"
        className="hidden"
        onChange={(event) => {
          void handleFile(event);
        }}
      />

      <AlertDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          {pending ? <DialogBody pending={pending} projectCount={countAtOpen} /> : null}
          <AlertDialogFooter>
            {pending?.kind === 'error' ? (
              <AlertDialogAction>Entendi</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className={
                    pending?.kind === 'clear'
                      ? buttonVariants({ variant: 'destructive' })
                      : undefined
                  }
                  onClick={() => {
                    void confirm();
                  }}
                >
                  {pending?.kind === 'import'
                    ? 'Importar e substituir'
                    : pending?.kind === 'sample'
                      ? 'Carregar exemplo'
                      : 'Apagar tudo'}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DialogBody({ pending, projectCount }: { pending: PendingAction; projectCount: number }) {
  const single = projectCount === 1;
  const current = single ? 'O projeto atual' : `Os ${String(projectCount)} projetos atuais`;
  const replaced = single ? 'será substituído' : 'serão substituídos';
  const backupTip = `Exporte um backup antes se quiser ${single ? 'guardá-lo' : 'guardá-los'}.`;

  switch (pending.kind) {
    case 'import':
      return (
        <AlertDialogHeader>
          <AlertDialogTitle>Substituir seus projetos?</AlertDialogTitle>
          <AlertDialogDescription>
            {current} {replaced} pelo conteúdo de “{pending.fileName}” (
            {pluralizeProjects(pending.snapshot.projects.length)}). {backupTip}
          </AlertDialogDescription>
        </AlertDialogHeader>
      );
    case 'sample':
      return (
        <AlertDialogHeader>
          <AlertDialogTitle>Carregar os dados de exemplo?</AlertDialogTitle>
          <AlertDialogDescription>
            {current} {replaced} pelos projetos de exemplo. {backupTip}
          </AlertDialogDescription>
        </AlertDialogHeader>
      );
    case 'clear':
      return (
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar todos os projetos?</AlertDialogTitle>
          <AlertDialogDescription>
            {single
              ? 'O projeto será removido'
              : `Os ${String(projectCount)} projetos serão removidos`}{' '}
            deste navegador. Essa ação não pode ser desfeita. {backupTip}
          </AlertDialogDescription>
        </AlertDialogHeader>
      );
    case 'error':
      return (
        <AlertDialogHeader>
          <AlertDialogTitle>Não foi possível importar</AlertDialogTitle>
          <AlertDialogDescription>{pending.message}</AlertDialogDescription>
          {pending.details.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {pending.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </AlertDialogHeader>
      );
  }
}
