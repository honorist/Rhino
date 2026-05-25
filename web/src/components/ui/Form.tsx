import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import type { ReactNode } from 'react';
import FormField from './FormField';

/**
 * Ponte RHF ↔ shadcn/ui. Permite escrever:
 *
 *   <Form {...methods} onSubmit={methods.handleSubmit(save)}>
 *     <FormControlField
 *       name="cnpj"
 *       label="CNPJ"
 *       required
 *       render={({ field }) => <input {...field} className="input" />}
 *     />
 *   </Form>
 *
 * O `error` chega automático no FormField a partir de formState.errors.
 * Schema com Zod: passar via `useForm({ resolver: zodResolver(schema) })`.
 */

interface FormProps<TValues extends FieldValues> extends UseFormReturn<TValues> {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  className?: string;
}

export function Form<TValues extends FieldValues>({
  onSubmit,
  children,
  className,
  ...methods
}: FormProps<TValues>) {
  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} className={className} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}

interface FormControlFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> {
  name: TName;
  label: string;
  helper?: string;
  required?: boolean;
  render: ControllerProps<TValues, TName>['render'];
}

/**
 * Campo controlado RHF + FormField. Lê o erro do formState e propaga para
 * o FormField sem o consumer precisar tocar em useFormContext manualmente.
 */
export function FormControlField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({ name, label, helper, required, render }: FormControlFieldProps<TValues, TName>) {
  const { control, formState } = useFormContext<TValues>();
  const error = formState.errors[name]?.message as string | undefined;
  return (
    <FormField
      label={label}
      htmlFor={name}
      error={error}
      helper={helper}
      required={required}
    >
      <Controller control={control} name={name} render={render} />
    </FormField>
  );
}
