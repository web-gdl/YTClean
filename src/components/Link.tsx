import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { href, navigate } from '../app/router';

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
  replace?: boolean;
}

/** Enlace interno: navegación sin recarga, respetando clic con modificadores. */
export function Link({ to, children, replace, onClick, ...rest }: Props) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to, replace ? { replace: true } : {});
  };
  return (
    <a href={href(to)} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

/** Enlace externo: sin referrer, sin acceso a window.opener, en pestaña nueva. */
export function ExternalLink({ href: url, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer external" referrerPolicy="no-referrer" {...rest}>
      {children}
    </a>
  );
}
