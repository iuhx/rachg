import { decodeHTMLStrict } from 'entities';

/** Equivalent named-entity decoding without a DOM, also safe in conversion workers. */
export function decodeNamedCharacterReference(value: string): string | false {
  const input = `&${value};`, decoded = decodeHTMLStrict(input);
  return decoded === input ? false : decoded;
}
