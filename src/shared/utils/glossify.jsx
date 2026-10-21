import { Tooltip } from 'antd';
import { Fragment } from 'react';
import { GLOSSARY, GLOSSARY_TERMS } from '@shared/constants/glossary';

const PATTERN = new RegExp(
  `\\b(${GLOSSARY_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'g',
);

/**
 * Splits `text` on every recognised abbreviation and wraps each one in a
 * dotted-underline tooltip spelling it out. Plain text (and anything that
 * isn't a plain string — an already-composed node, a number) passes through
 * unchanged, so this is safe to wrap around any label without first checking
 * what it is.
 */
export function glossify(text) {
  if (typeof text !== 'string') return text;
  const parts = text.split(PATTERN);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const full = GLOSSARY[part];
    if (!full) return <Fragment key={i}>{part}</Fragment>;
    return (
      <Tooltip key={i} title={full}>
        <span style={{ borderBottom: '1px dotted currentColor', cursor: 'help' }}>{part}</span>
      </Tooltip>
    );
  });
}
