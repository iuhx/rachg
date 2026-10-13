const test = require('node:test');
const assert = require('node:assert/strict');
const { components, find, label, elements } = require('./component-fixture.cjs');
const button = (h, name) => find(h, n => n.type === 'button' && label(n) === name);
const field = (h, name) => find(h, n => n.props['aria-label'] === name);
const flush = () => new Promise(resolve => setImmediate(resolve));

test('rich text preserves headings, styled text, lists, links, code and GFM tables', () => {
  const { richTextToMarkdown } = components().load('apps/workspace/src/utils/richText.ts');
  const result = richTextToMarkdown('<h2>Title</h2><p>Hello <span style="font-weight:700;font-style:italic">world</span>.</p><ol start="3"><li>three</li><li>four</li></ol><p><a href="https://example.com/guide">Guide</a></p><pre><code class="language-js">const x = 1;\nnext();</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>one</td><td>two</td></tr></table>');
  assert.match(result.markdown, /^## Title/); assert.match(result.markdown, /\*\*\*world\*\*\*/);
  assert.match(result.markdown, /3\. three/); assert.match(result.markdown, /4\. four/);
  assert.match(result.markdown, /\[Guide\]\(https:\/\/example.com\/guide\)/);
  assert.match(result.markdown, /```js\nconst x = 1;\nnext\(\);\n```/);
  assert.match(result.markdown, /\| one\s+\| two/);
  assert.doesNotMatch(result.html, /style=/);
  assert.equal(richTextToMarkdown('<b style="font-weight:700">Bold</b>').markdown, '**Bold**');
});

test('untrusted clipboard HTML cannot retain active elements, media requests or unsafe URLs', () => {
  const { richTextToMarkdown } = components().load('apps/workspace/src/utils/richText.ts');
  const result = richTextToMarkdown('<script>bad()</script><style>bad()</style><iframe src="https://tracker.invalid"></iframe><svg onload="bad()"><text>bad</text></svg><p id="location" onclick="bad()">Safe <a href="java&#x73;cript:bad()">label</a></p><img src="https://example.com/picture.png" onerror="bad()" alt="Picture"><img src="data:image/png;base64,AAAA" alt="Local"><p style="display:none">secret hidden text</p>');
  assert.doesNotMatch(result.html, /<(script|style|iframe|svg|img)\b|onload|onclick|onerror|javascript:|data:image|id=|hidden text/);
  assert.doesNotMatch(result.markdown, /bad\(\)|tracker\.invalid|javascript:|hidden text/);
  assert.match(result.markdown, /\[Picture\]\(https:\/\/example.com\/picture.png\)/);
  assert.match(result.markdown, /embedded image omitted/);
});

test('rich input rejects oversized and deeply nested content and escapes plain clipboard text', () => {
  const { richTextToMarkdown, plainTextHtml } = components().load('apps/workspace/src/utils/richText.ts');
  assert.throws(() => richTextToMarkdown('字'.repeat(70000)), /200 KB/);
  assert.throws(() => richTextToMarkdown('<blockquote>'.repeat(70)+'text'+'</blockquote>'.repeat(70)), /too complex/);
  const result = richTextToMarkdown(plainTextHtml('<script>alert(1)</script>\n\nA & B'));
  assert.doesNotMatch(result.html, /<script>/); assert.match(result.html, /&#x3C;script>|&lt;script>/);
  assert.match(result.markdown, /A & B/);
});

test('saved notes render Markdown links and tables without interpreting HTML or fetching images', () => {
  const f=components(), {MarkdownPreview}=f.load('apps/workspace/src/components/MarkdownPreview.tsx');
  const h=f.mount(MarkdownPreview,{content:'[Guide](https://example.com/guide) and (https://example.com/plain)\n\n![Image](https://example.com/image.png)\n\n| A | B |\n| - | - |\n| one | two |\n\n<script>bad()</script>\n\n[Unsafe](javascript:alert(1))'});
  const nodes=elements(h.tree),links=nodes.filter(n=>n.type==='a');
  assert.equal(links[0].props.href,'https://example.com/guide');assert.equal(links[1].props.href,'https://example.com/plain');
  assert.equal(nodes.some(n=>n.type==='table'),true);assert.equal(nodes.some(n=>n.type==='img'||n.type==='script'||n.props.dangerouslySetInnerHTML),false);
  assert.ok(links.every(n=>!n.props.href.startsWith('javascript:')));h.unmount();
});

test('both conversion directions save their reviewed output and remember saved state independently', async () => {
  const f = components(), { TextConverter } = f.load('apps/workspace/src/components/TextConverter.tsx');
  const saves = []; let opened = false;
  const h = f.mount(TextConverter, { canSave:true, isActive:true, onSaveNote:async note=>saves.push(note), onOpenNotes(){opened=true;}, onToQr(){} });
  try {
    field(h,'Markdown input').props.onChange({target:{value:'# Title\n\n**Plain** result'}}); h.render();
    assert.equal(saves.length,0);
    button(h,'Save to Notes').props.onClick(); h.render();
    let modal=find(h,n=>n.type?.name==='NewItemModal');
    assert.equal(modal.props.initialNote.content,'Title\n\nPlain result');
    await modal.props.onCreateNote(modal.props.initialNote); modal.props.onClose(); h.render();
    assert.equal(button(h,'Saved to Notes').props.disabled,true);
    button(h,'Rich text').props.onClick(); h.render();
    find(h,n=>n.type?.name==='RichTextInput').props.onResult('## Rich\n\n**formatted**',''); h.render();
    button(h,'Save to Notes').props.onClick(); h.render(); modal=find(h,n=>n.type?.name==='NewItemModal');
    assert.equal(modal.props.initialNote.content,'## Rich\n\n**formatted**');
    await modal.props.onCreateNote(modal.props.initialNote); modal.props.onClose(); h.render();
    assert.equal(saves.length,2);
    button(h,'Markdown').props.onClick(); h.render();
    assert.equal(button(h,'Saved to Notes').props.disabled,true);
    button(h,'Open Notes').props.onClick(); assert.equal(opened,true);
  } finally {h.unmount();}
});

test('prefilled note review retains edits when hidden and after a failed save', async () => {
  const f=components(), {NewItemModal}=f.load('apps/workspace/src/components/NewItemModal.tsx'); let closed=false;
  const props={isOpen:true,isActive:true,type:'note',initialNote:{title:'Converted',content:'original result'},onClose(){closed=true;},onCreateNote:async()=>{throw new Error('Save unavailable');},onCreateTransfer:async()=>{}};
  const h=f.mount(NewItemModal,props);
  try {
    find(h,n=>n.type==='textarea').props.onChange({target:{value:'reviewed result'}}); h.render();
    props.isActive=false;h.render();props.isActive=true;h.render();
    assert.equal(find(h,n=>n.type==='textarea').props.value,'reviewed result');
    await find(h,n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
    assert.equal(closed,false);assert.match(label(h.tree),/Save unavailable/);
    assert.equal(find(h,n=>n.type==='textarea').props.value,'reviewed result');
  } finally {h.unmount();}
});

test('saving a converted note updates the shared Notes list through the workspace callback', async () => {
  const f=components();
  f.services.accessService.getAccessIdentity=async()=>({email:'admin@example.invalid'});
  f.services.noteService.fetchNotes=f.services.fileService.fetchActiveFiles=f.services.mailService.fetchMail=f.services.mailService.fetchSentMail=async()=>[];
  f.services.noteService.createNote=async(title,content)=>({id:'converted',title,content,excerpt:content,updatedAt:'now',updatedTimestamp:1});
  const {WorkspaceApp}=f.load('apps/workspace/src/components/WorkspaceApp.tsx');const h=f.mount(WorkspaceApp,{});
  try {
    await flush();h.render();find(h,n=>n.type?.name==='Sidebar').props.onTabChange('tools');h.render();
    const tools=find(h,n=>typeof n.props.onSaveNote==='function').props;
    await tools.onSaveNote({title:'Rich',content:'**saved Markdown**'});h.render();
    assert.equal(find(h,n=>n.type?.name==='NotesView').props.notes[0].content,'**saved Markdown**');
    tools.onOpenNotes();h.render();assert.equal(find(h,n=>n.type?.name==='NotesView').props.isActive,true);
  } finally {h.unmount();}
});

test('signed-out conversion stays local and saving is unavailable', () => {
  const f=components(), {TextConverter}=f.load('apps/workspace/src/components/TextConverter.tsx');let saves=0;
  const h=f.mount(TextConverter,{canSave:false,isActive:true,onSaveNote:async()=>{saves++;},onOpenNotes(){},onToQr(){}});
  try {
    field(h,'Markdown input').props.onChange({target:{value:'# Local'}});h.render();
    assert.equal(field(h,'Plain text preview').props.value,'Local');assert.equal(button(h,'Save to Notes').props.disabled,true);
    button(h,'Save to Notes').props.onClick();h.render();assert.equal(saves,0);assert.equal(elements(h.tree).some(n=>n.type?.name==='NewItemModal'),false);
  }finally{h.unmount();}
});
