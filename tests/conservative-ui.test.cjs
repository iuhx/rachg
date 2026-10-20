const test=require('node:test');
const assert=require('node:assert/strict');
const {components,find,label,elements}=require('./component-fixture.cjs');
const note=id=>({id,title:id,content:'original '+id,excerpt:'text',updatedAt:'now',updatedTimestamp:1});
function setup(onUpdate){
  const f=components(),{NotesView}=f.load('apps/workspace/src/components/NotesView.tsx');
  const props={notes:[note('A'),note('B')],onNewNote(){},onDeleteNote:async()=>{},onUpdateNote:onUpdate||(async()=>{})};
  const h=f.mount(NotesView,props);
  return {...f,h,props};
}
function edit(f,value='draft'){find(f.h,n=>n.type==='button'&&label(n)==='Edit').props.onClick();f.h.render();find(f.h,n=>n.type==='textarea').props.onChange({target:{value}});f.h.render();}

test('note switching waits for the current draft to save',async()=>{
  let resolve,saved;
  const f=setup(n=>{saved=n;return new Promise(r=>resolve=r);});edit(f);
  const switching=find(f.h,n=>n.type==='button'&&label(n).startsWith('B')).props.onClick();f.h.render();
  assert.equal(saved.content,'draft');assert.equal(find(f.h,n=>n.type==='textarea').props.value,'draft');
  resolve();await switching;f.h.render();assert.equal(elements(f.h.tree).some(n=>n.type==='textarea'),false);
  f.h.unmount();
});

test('failed save keeps the note selection, draft and backup',async()=>{
  const f=setup(async()=>{throw new Error('offline');});edit(f);
  await find(f.h,n=>n.type==='button'&&label(n).startsWith('B')).props.onClick();f.h.render();
  assert.equal(find(f.h,n=>n.type==='textarea').props.value,'draft');assert.ok(f.storage.has('rachg.note-draft.A'));
  assert.match(label(f.h.tree),/offline/);f.h.unmount();
});

test('overlapping Save commands create only one pending write and retain later edits',async()=>{
  let calls=0,resolve;const f=setup(()=>{calls++;return new Promise(r=>resolve=r);});edit(f);
  const save=find(f.h,n=>n.type==='button'&&label(n)==='Save').props.onClick;
  save();save();assert.equal(calls,1);
  find(f.h,n=>n.type==='textarea').props.onChange({target:{value:'newer draft'}});f.h.render();
  resolve();await new Promise(r=>setImmediate(r));f.h.render();
  assert.equal(JSON.parse(f.storage.get('rachg.note-draft.A')).content,'newer draft');f.h.unmount();
});

test('leaving Notes disables shortcuts without discarding edits; closing the page warns',()=>{
  const f=setup();edit(f);f.props.isActive=false;f.h.render();
  assert.equal(f.events.get('keydown')?.size||0,0);
  assert.equal(find(f.h,n=>n.type==='textarea').props.value,'draft');
  let prevented=false;for(const handler of f.events.get('beforeunload'))handler({preventDefault(){prevented=true;}});
  assert.ok(prevented);f.h.unmount();
});

test('a remounted note recovers backup without automatically overwriting the server',()=>{
  let saves=0;const f=setup(async()=>{saves++;});edit(f);f.h.unmount();
  const {NotesView}=f.load('apps/workspace/src/components/NotesView.tsx');
  const fresh=f.mount(NotesView,f.props);
  assert.equal(find(fresh,n=>n.type==='textarea').props.value,'draft');
  assert.match(label(fresh.tree),/Recovered a draft/);assert.equal([...f.timers.values()].filter(t=>t.ms===900).length,0);assert.equal(saves,0);fresh.unmount();
});

test('Notes category controls stay in one compact row and note actions use equal mobile icon buttons',()=>{
  const f=setup();
  const category=find(f.h,n=>n.props['aria-label']==='Filter notes by category');
  assert.match(category.props.className,/min-w-0 flex-1/);
  const manage=find(f.h,n=>n.props['aria-label']==='Manage categories');
  assert.match(manage.props.className,/h-9 w-9 min-h-9/);
  assert.match(manage.props.className,/sm:w-auto/);
  const actions=find(f.h,n=>n.props['aria-label']==='Note actions');
  assert.match(actions.props.className,/flex-nowrap/);
  for(const name of ['Edit note','Download note as Markdown','Share note','Delete note']){
    const button=find(f.h,n=>n.type==='button'&&n.props['aria-label']===name);
    assert.match(button.props.className,/h-11 min-h-11/);
    assert.match(button.props.className,/flex-1 basis-0/);
    assert.match(button.props.className,/sm:flex-none sm:basis-auto/);
  }
  f.h.unmount();
});

test('older email detail responses cannot replace the latest selection',async()=>{
  const f=components(),{WorkspaceApp}=f.load('apps/workspace/src/components/WorkspaceApp.tsx');
  const h=f.mount(WorkspaceApp,{});
  find(h,n=>n.type?.name==='Sidebar').props.onTabChange('mail');h.render();
  const resolve={};f.services.mailService.fetchMailMessage=id=>new Promise(r=>resolve[id]=r);
  const select=find(h,n=>n.type?.name==='MailView').props.onSelect;
  const a=select({id:'A'}),b=select({id:'B'});
  resolve.B({id:'B',text:'latest'});await b;resolve.A({id:'A',text:'stale'});await a;h.render();
  assert.equal(find(h,n=>n.type?.name==='MailView').props.selectedMessage.id,'B');h.unmount();
});

test('failed uploads preserve the selected file and keep the modal open',async()=>{
  const f=components(),{NewItemModal}=f.load('apps/workspace/src/components/NewItemModal.tsx');let closed=false;
  const h=f.mount(NewItemModal,{isOpen:true,type:'transfer',onClose(){closed=true;},onCreateProject(){},onCreateNote:async()=>{},onCreateTransfer:async()=>{throw new Error('Upload unavailable');}});
  const file=new File(['test'],'draft.txt');find(h,n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});h.render();
  await find(h,n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.equal(closed,false);assert.match(label(h.tree),/Upload unavailable/);assert.equal(find(h,n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);h.unmount();
});

test('overview replaces quick-start tiles with the calendar and daily task panel',()=>{
  const f=components(),{DashboardView}=f.load('apps/workspace/src/components/DashboardView.tsx');
  const actions=[];
  const props={transfers:[],notes:[],messages:[],sentMessages:[],canCreate:true,onNewItem(type){actions.push(type);},onNavigate(tab){actions.push(tab);}};
  const h=f.mount(DashboardView,props);
  assert.doesNotMatch(label(h.tree),/Start something|This week/);assert.match(label(h.tree),/Recent activity/);
  assert.equal(find(h,n=>n.type?.name==='DailyPlanner').props.canManage,true);
  props.canCreate=false;h.render();assert.equal(find(h,n=>n.type?.name==='DailyPlanner').props.canManage,false);h.unmount();
});

test('the global new-project command opens Projects instead of the obsolete placeholder',()=>{
  const f=components(),{WorkspaceApp}=f.load('apps/workspace/src/components/WorkspaceApp.tsx');
  const h=f.mount(WorkspaceApp,{});
  find(h,n=>n.type?.name==='CommandPalette').props.onOpenNewModal('project');h.render();
  const projects=find(h,n=>n.type?.name==='ProjectsView');
  assert.equal(projects.props.isActive,true);assert.equal(projects.props.createRequest,1);
  assert.equal(find(h,n=>n.type?.name==='NewItemModal').props.isOpen,false);h.unmount();
});
