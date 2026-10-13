import { Lexer, type Token, type Tokens } from 'marked';
import { decodeHTML } from 'entities';
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType, type IParagraphOptions, type IRunOptions, type ParagraphChild, type INumberingOptions } from 'docx';
import { checkTextSize } from './richText';
import { markdownToText } from './markdownText';
import { safeDocumentLink } from './documentFormats';

export async function markdownToDocx(markdown: string): Promise<Blob> {
  checkTextSize(markdown); markdownToText(markdown); // Bound reference expansion as well as source size.
  let nodes = 0;
  const numbering: INumberingOptions['config'][number][] = [];
  const guard = (depth: number) => { if (++nodes > 15_000 || depth > 32) throw new Error('This document is too complex. Convert a smaller section.'); };
  const run = (value: string, style: IRunOptions = {}) => new TextRun({ ...style, text: value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '\ufffd') });
  const inline = (tokens: Token[], depth = 0, style: IRunOptions = {}, inLink = false): ParagraphChild[] => tokens.flatMap(token => {
    guard(depth);
    switch (token.type) {
      case 'strong': return inline((token as Tokens.Strong).tokens, depth + 1, { ...style, bold: true }, inLink);
      case 'em': return inline((token as Tokens.Em).tokens, depth + 1, { ...style, italics: true }, inLink);
      case 'del': return inline((token as Tokens.Del).tokens, depth + 1, { ...style, strike: true }, inLink);
      case 'codespan': return [run((token as Tokens.Codespan).text, { ...style, style: 'InlineCode', font: 'Consolas', size: 20 })];
      case 'br': return [new TextRun({ break: 1 })];
      case 'link': case 'image': {
        const link = token as Tokens.Link | Tokens.Image, href = safeDocumentLink(decodeHTML(link.href));
        const linkStyle = href ? { ...style, style: 'Hyperlink' } : style;
        const children = link.tokens ? inline(link.tokens, depth + 1, linkStyle, true) : [run(decodeHTML(link.text || 'Image'), linkStyle)];
        return href && !inLink ? [new ExternalHyperlink({ link: href, children })] : children;
      }
      case 'checkbox': return [];
      default: {
        const text = token as Tokens.Text;
        return text.tokens ? inline(text.tokens, depth + 1, style, inLink) : [run(decodeHTML(text.text || token.raw), style)];
      }
    }
  });
  const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  const blocks = (tokens: Token[], depth = 0, base: IParagraphOptions = {}, number?: IParagraphOptions['numbering'], prefix = ''): (Paragraph | Table)[] => {
    let first = true;
    const paragraph = (children: ParagraphChild[], options: IParagraphOptions = {}) => {
      const value = new Paragraph({ ...base, ...(first && number ? { numbering: number } : {}), ...options, children: [...(first && prefix ? [run(prefix)] : []), ...children] });
      first = false; return value;
    };
    return tokens.flatMap((token): (Paragraph | Table)[] => {
      guard(depth);
      switch (token.type) {
        case 'space': case 'def': return [];
        case 'heading': return [paragraph(inline((token as Tokens.Heading).tokens), { heading: headings[(token as Tokens.Heading).depth - 1] })];
        case 'paragraph': return [paragraph(inline((token as Tokens.Paragraph).tokens))];
        case 'text': return [paragraph(inline([token]))];
        case 'code': return [paragraph((token as Tokens.Code).text.split('\n').map((line, index) => { guard(depth + 1); return run(line, { font: 'Consolas', size: 20, ...(index ? { break: 1 } : {}) }); }), { style: 'CodeBlock', spacing: { before: 120, after: 200 } })];
        case 'blockquote': return blocks((token as Tokens.Blockquote).tokens, depth + 1, { ...base, indent: { left: 360 * (depth + 1) } }, number, prefix);
        case 'list': {
          const list = token as Tokens.List, reference = `list-${numbering.length}`, level = Math.min(depth, 8);
          numbering.push({ reference, levels: Array.from({ length: level + 1 }, (_, index) => ({ level: index, format: list.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET, text: list.ordered ? `%${index + 1}.` : '•', start: list.ordered ? Number(list.start) : 1, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 540 * (index + 1), hanging: 260 } } } })) });
          return list.items.flatMap(item => blocks(item.tokens, depth + 1, { indent: { left: 540 * (level + 1) } }, { reference, level }, item.task ? item.checked ? '☑ ' : '☐ ' : ''));
        }
        case 'table': {
          const table = token as Tokens.Table;
          if (table.header.length > 20 || table.rows.length > 500) throw new Error('This table is too large for Word export. Use up to 20 columns and 500 rows.');
          const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
          return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [table.header, ...table.rows].map((row, index) => new TableRow({ tableHeader: index === 0, children: row.map((cell, column) => {
              guard(depth + 1);
              return new TableCell({ verticalAlign: VerticalAlign.CENTER, margins: { top: 100, bottom: 100, left: 120, right: 120 }, borders: { top: border, bottom: border, left: border, right: border },
                ...(index === 0 ? { shading: { fill: 'F1F2F4' } } : {}),
                children: [new Paragraph({ alignment: table.align[column] === 'center' ? AlignmentType.CENTER : table.align[column] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT, children: inline(cell.tokens, depth + 1, { bold: index === 0 }), spacing: { after: 0 } })] });
            }) })) })];
        }
        case 'hr': return [paragraph([run('— — —')])];
        default: return [paragraph(inline([token]))];
      }
    });
  };
  const children = blocks(Lexer.lex(markdown, { gfm: true }));
  const document = new Document({ creator: 'rachg', title: 'Converted document', numbering: { config: numbering },
    styles: { default: { document: { run: { font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' }, size: 22, color: '000000' }, paragraph: { spacing: { after: 160, line: 276 } } } },
      paragraphStyles: [...headings.map((id, index) => ({ id, name: `Heading ${index + 1}`, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { color: '000000', bold: true, size: [32, 28, 26, 24, 22, 22][index] }, paragraph: { keepNext: true, spacing: { before: 240, after: 120 }, outlineLevel: index } })), { id: 'CodeBlock', name: 'Code Block', basedOn: 'Normal', run: { font: 'Consolas', size: 20 } }],
      characterStyles: [{ id: 'InlineCode', name: 'Inline Code', run: { font: 'Consolas', size: 20 } }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: children.length ? children : [new Paragraph('')] }] });
  return Packer.toBlob(document);
}
