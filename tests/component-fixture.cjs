// Deterministic component-handler tests, not a browser/DOM renderer.
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const req=createRequire(path.join(root,'apps/workspace/package.json'));
const ts=createRequire(path.join(root,'package.json'))('typescript');
const React=req('react');

function components(){
  let current, nextTimer=0;
  const timers=new Map(),events=new Map(),storage=new Map(),modules=new Map();
  global.window={
    setTimeout(fn,ms){timers.set(++nextTimer,{fn,ms});return nextTimer;},clearTimeout(id){timers.delete(id);},
    setInterval(){return ++nextTimer;},clearInterval(){},scrollTo(){},
    addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},
    removeEventListener(name,fn){events.get(name)?.delete(fn);},
    sessionStorage:{setItem(k,v){storage.set(k,v);},getItem(k){return storage.get(k)??null;},removeItem(k){storage.delete(k);}},
  };
  global.document={documentElement:{classList:{add(){},remove(){}}},activeElement:null};
  const hooks={...React,
    useState(initial){const h=current,i=h.cursor++;if(!(i in h.values))h.values[i]=typeof initial==='function'?initial():initial;return[h.values[i],v=>{const next=typeof v==='function'?v(h.values[i]):v;if(!Object.is(next,h.values[i])){h.values[i]=next;h.dirty=true;}}];},
    useRef(initial){const h=current,i=h.cursor++;return h.values[i]??(h.values[i]={current:initial});},
    useMemo(fn,deps){const h=current,i=h.cursor++,old=h.values[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))h.values[i]={deps,value:fn()};return h.values[i].value;},
    useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const h=current,i=h.cursor++,old=h.effects[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps[j])))h.pending.push(()=>{old?.cleanup?.();h.effects[i]={deps,cleanup:fn()};});},
  };
  const services={accessService:{getAccessIdentity:async()=>null,startAccessLogout(){}},fileService:{AuthenticationRequiredError:class extends Error{}},noteService:{fetchNoteCategories:async()=>[]},mailService:{},projectService:{fetchProjects:async()=>[]},storageService:{fetchWebdavSettings:async()=>({configured:false,source:"worker-secrets",baseUrl:"https://higa.teracloud.jp/dav/rachg/",verifiedAt:null})},todoService:{fetchTodos:async()=>[],fetchTodoMonth:async()=>[]},imageConversionService:{},documentConversionService:{}};
  function load(file){
    file=path.isAbsolute(file)?file:path.join(root,file);
    if(modules.has(file))return modules.get(file);
    const exports={};modules.set(file,exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.React}}).outputText;
    new Function('require','exports',code)(id=>{
      if(id==='react')return hooks;
      if(id.includes('/services/'))return services[id.split('/').pop()];
      if(id.startsWith('.')){const base=path.resolve(path.dirname(file),id);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts');}
      return req(id);
    },exports);return exports;
  }
  function mount(Component,props){
    const h={values:[],effects:[],pending:[],cursor:0,dirty:true,tree:null,props,
      render(){let n=0;do{this.dirty=false;this.cursor=0;this.pending=[];current=this;this.tree=Component(this.props);current=null;this.pending.forEach(fn=>fn());if(++n>30)throw new Error('Component failed to settle');}while(this.dirty);return this.tree;},
      unmount(){this.effects.forEach(e=>e?.cleanup?.());},
    };h.render();return h;
  }
  return {load,mount,timers,events,storage,services};
}
function elements(node,result=[]){if(Array.isArray(node))node.forEach(n=>elements(n,result));else if(node&&typeof node==='object'&&node.props){result.push(node);elements(node.props.children,result);}return result;}
function label(node){if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(label).join('');return node?.props?label(node.props.children):'';}
function find(h,predicate){const result=elements(h.tree).find(predicate);if(!result)throw new Error('Fixture element not found');return result;}
module.exports={components,find,label,elements};
