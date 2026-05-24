import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

/** <input> com a classe .form-control do CSS atual. */
export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('form-control', className)} {...rest} />;
}

/** <select> com a classe .form-control do CSS atual. */
export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('form-control', className)} {...rest}>
      {children}
    </select>
  );
}

/** <textarea> com a classe .form-control do CSS atual. */
export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('form-control', className)} {...rest} />;
}
