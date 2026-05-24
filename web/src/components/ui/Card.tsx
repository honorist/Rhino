import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement>;

/** Contêiner com a classe .card do CSS atual. */
export default function Card({ className, ...rest }: CardProps) {
  return <div className={['card', className].filter(Boolean).join(' ')} {...rest} />;
}
