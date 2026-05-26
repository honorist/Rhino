import { useState } from 'react';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import Button from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DatePickerProps {
  /** Valor em formato ISO (YYYY-MM-DD), como <input type="date">. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** Date picker com Calendar shadcn. API compatível com <input type="date">: value/onChange em YYYY-MM-DD. */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecione uma data',
  disabled = false,
  id,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const date = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const validDate = date && isValid(date) ? date : undefined;

  function handleSelect(selected: Date | undefined) {
    if (selected) {
      onChange(format(selected, 'yyyy-MM-dd'));
    } else {
      onChange('');
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !validDate && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {validDate ? format(validDate, 'dd/MM/yyyy', { locale: ptBR }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={validDate}
          onSelect={handleSelect}
          locale={ptBR}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
