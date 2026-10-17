import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';

const imageEmbed = /^\s*!\[\[([^\]|]+)(?:\|(\d+))?\]\]\s*$/;

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export async function renderObsidian(markdown, baseUrl) {
  const renderer = await createSatteriMarkdownProcessor({
    features: { smartPunctuation: false },
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: 'github-dark', langAlias: { 'c#': 'csharp' } },
  });
  const lines = markdown.split(/\r?\n/);
  const output = [];
  const imageBase = `${baseUrl.replace(/\/?$/, '/')}images/`;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) inCodeBlock = !inCodeBlock;
    const image = !inCodeBlock && lines[i].match(imageEmbed);
    if (!image) {
      output.push(lines[i]);
      continue;
    }

    const [, filename, width] = image;
    const source = escapeAttribute(imageBase + encodeURIComponent(filename));
    const widthAttribute = width ? ` width="${width}"` : '';
    let caption = '';

    // Only text on the very next source line belongs to this image's caption.
    const nextLine = lines[i + 1];
    if (nextLine?.trim() && !imageEmbed.test(nextLine)) {
      const renderedCaption = await renderer.render(nextLine);
      const inlineCaption = renderedCaption.code.trim().replace(/^<p>/, '').replace(/<\/p>$/, '');
      caption = `<figcaption>${inlineCaption}</figcaption>`;
      i++;
    }

    output.push('', `<figure><img src="${source}" alt=""${widthAttribute} loading="lazy" decoding="async">${caption}</figure>`, '');
  }

  return (await renderer.render(output.join('\n'))).code;
}
