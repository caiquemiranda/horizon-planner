import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';

import { useTheme } from '@/app/theme-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isThemePreference, type ThemePreference } from '@/lib/theme';

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export function ThemeToggle() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const TriggerIcon = resolvedTheme === 'dark' ? Moon : Sun;
  const currentLabel = OPTIONS.find((option) => option.value === preference)?.label ?? '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Tema: ${currentLabel}`}>
          <TriggerIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-label">Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => {
            if (isThemePreference(value)) setPreference(value);
          }}
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
