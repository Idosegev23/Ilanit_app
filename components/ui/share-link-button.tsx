'use client';

import * as React from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from './button';

interface ShareLinkButtonProps {
  /** Full public booking URL to share/copy. */
  url: string;
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

// Copies (or natively shares) the public /book link Ilanit hands to students.
// Shows a transient "הועתק" confirmation after copying.
export function ShareLinkButton({
  url,
  label = 'שתף לינק תיאום',
  variant = 'secondary',
  size = 'md',
  className,
}: ShareLinkButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleClick = React.useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'תיאום שיעור', url });
        return;
      }
    } catch {
      // user cancelled native share — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — no-op
    }
  }, [url]);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      aria-label={label}
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden="true" />
      ) : (
        <Share2 className="size-4" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{copied ? 'הקישור הועתק' : label}</span>
    </Button>
  );
}

interface CopyLinkFieldProps {
  url: string;
  className?: string;
}

// Read-only URL display with an inline copy button — used on the dashboard
// "לינק לתיאום שיעור" card.
export function CopyLinkField({ url, className }: CopyLinkFieldProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  }, [url]);

  return (
    <div
      className={
        'flex items-center gap-2 rounded-xl border border-line bg-cream/60 p-2 ' +
        (className ?? '')
      }
    >
      <span
        dir="ltr"
        className="flex-1 truncate px-2 text-sm text-ink"
        title={url}
      >
        {url}
      </span>
      <Button type="button" size="sm" variant="primary" onClick={handleCopy}>
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? 'הועתק' : 'העתק'}
      </Button>
    </div>
  );
}
