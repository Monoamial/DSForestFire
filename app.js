const EMPTY = 0, TREE = 1, BURNING = 2;
const $ = selector => document.querySelector(selector);
const ui = {
  canvas: $('#lattice'), spark: $('#sparkline'), clusterPlot: $('#clusterPlot'),
  p: $('#pInput'), f: $('#fInput'), pNumber: $('#pNumber'), fNumber: $('#fNumber'), size: $('#sizeInput'), speed: $('#speedInput'),
  sizeValue: $('#sizeValue'), speedValue: $('#speedValue'),
  generation: $('#generation'), density: $('#densityValue'), densityMeter: $('#densityMeter'), treeCount: $('#treeCount'), cluster: $('#clusterValue'), clusterCount: $('#clusterCount'), clusterSamples: $('#clusterSamples'), fitLabel: $('#fitLabel'), samplingStatus: $('#samplingStatus'), tauMetric: $('#tauMetric'), cutoffMetric: $('#cutoffMetric'), tauFitQuality: $('#tauFitQuality'), cutoffFitCount: $('#cutoffFitCount'),
  toggle: $('#toggleButton'), toggleIcon: $('#toggleIcon'), toggleText: $('#toggleText'), reset: $('#resetButton'), criticality: $('#criticalityButton')
};
const ctx = ui.canvas.getContext('2d', { alpha: false });
let n, cells, next, generation=0, running=true, clusterHistory=[], lastStats=0, clusterSizes=[], distributionSum=[], distributionSamples=0, tauSum=0, cutoffSum=0, fitSamples=0;

function initialize() {
  n=Number(ui.size.value); cells=new Uint8Array(n*n); next=new Uint8Array(n*n);
  for(let i=0;i<cells.length;i++) cells[i]=Math.random()<.5?TREE:EMPTY;
  generation=0; clusterHistory=[]; clusterSizes=[]; distributionSum=[]; distributionSamples=0; tauSum=0; cutoffSum=0; fitSamples=0; lastStats=-10;ui.tauMetric.textContent='—';ui.cutoffMetric.textContent='—';ui.tauFitQuality.textContent='WAITING';ui.cutoffFitCount.textContent='WAITING';ui.samplingStatus.textContent=`EQUILIBRATING · ${EQUILIBRATION_GENERATIONS} GENERATIONS LEFT`;ui.clusterSamples.textContent='0 SNAPSHOTS';ui.fitLabel.textContent='FIT WAITING FOR STEADY STATE';updateStats(true);draw();
}
function step() {
  const p=Number(ui.p.value), f=Number(ui.f.value);
  for(let y=0;y<n;y++) {
    const up=y?y-1:n-1, down=y===n-1?0:y+1;
    for(let x=0;x<n;x++) {
      const i=y*n+x, state=cells[i];
      if(state===BURNING){next[i]=EMPTY;continue;}
      if(state===EMPTY){next[i]=Math.random()<p?TREE:EMPTY;continue;}
      const left=x?x-1:n-1, right=x===n-1?0:x+1;
      const spread=cells[y*n+left]===BURNING||cells[y*n+right]===BURNING||cells[up*n+x]===BURNING||cells[down*n+x]===BURNING;
      next[i]=spread||Math.random()<f?BURNING:TREE;
    }
  }
  [cells,next]=[next,cells];generation++;
}
function draw() {
  ui.canvas.width=n;ui.canvas.height=n;const image=ctx.createImageData(n,n),data=image.data;
  for(let i=0,d=0;i<cells.length;i++,d+=4){const s=cells[i];if(s===TREE){data[d]=57;data[d+1]=101;data[d+2]=67;}else if(s===BURNING){data[d]=242;data[d+1]=82;data[d+2]=31;}else{data[d]=218;data[d+1]=213;data[d+2]=201;}data[d+3]=255;}
  ctx.putImageData(image,0,0);ui.generation.textContent=generation.toLocaleString();
}
function clusterStats() {
  const seen=new Uint8Array(cells.length),queue=new Int32Array(cells.length);clusterSizes=[];let total=0;
  for(let start=0;start<cells.length;start++){if(cells[start]!==TREE||seen[start])continue;let head=0,tail=1,size=0;queue[0]=start;seen[start]=1;
    while(head<tail){const i=queue[head++],y=Math.floor(i/n),x=i-y*n;size++;const nb=[y*n+(x?x-1:n-1),y*n+(x===n-1?0:x+1),(y?y-1:n-1)*n+x,(y===n-1?0:y+1)*n+x];for(const j of nb)if(cells[j]===TREE&&!seen[j]){seen[j]=1;queue[tail++]=j;}}
    clusterSizes.push(size);total+=size;
  }
  return{clusters:clusterSizes.length,average:clusterSizes.length?total/clusterSizes.length:0};
}
function updateStats(force=false) {
  if(!force&&generation-lastStats<5)return;lastStats=generation;let trees=0;for(const c of cells)if(c===TREE)trees++;
  const density=trees/cells.length,cs=clusterStats();ui.density.textContent=density.toFixed(3);ui.densityMeter.style.width=`${density*100}%`;ui.treeCount.textContent=trees.toLocaleString();ui.cluster.textContent=cs.average?(cs.average<100?cs.average.toFixed(1):cs.average.toFixed(0)):'0';ui.clusterCount.textContent=cs.clusters.toLocaleString();
  clusterHistory.push(cs.average);if(clusterHistory.length>80)clusterHistory.shift();accumulateDistribution();drawSparkline();drawClusterDistribution();
}
function setupCanvas(canvas){const d=devicePixelRatio,w=Math.round(canvas.clientWidth*d),h=Math.round(canvas.clientHeight*d);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const c=canvas.getContext('2d');c.clearRect(0,0,w,h);return{c,w,h,d};}
function drawSparkline(){const{c,w,h,d}=setupCanvas(ui.spark);if(clusterHistory.length<2)return;const max=Math.max(...clusterHistory,1),min=Math.min(...clusterHistory),range=Math.max(max-min,1);c.beginPath();clusterHistory.forEach((v,i)=>{const x=i/(clusterHistory.length-1)*w,y=h-4*d-(v-min)/range*(h-9*d);i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle='#ed5a24';c.lineWidth=1.5*d;c.stroke();}
const DISTRIBUTION_BINS=120, EQUILIBRATION_GENERATIONS=500;
function accumulateDistribution(){
  if(generation<EQUILIBRATION_GENERATIONS){ui.samplingStatus.textContent=`EQUILIBRATING · ${EQUILIBRATION_GENERATIONS-generation} GENERATIONS LEFT`;ui.clusterSamples.textContent='0 SNAPSHOTS';return;}
  ui.samplingStatus.textContent='LOG–LOG · STEADY-STATE RUNNING AVERAGE';
  if(!distributionSum.length)distributionSum=new Float64Array(DISTRIBUTION_BINS);
  const maxS=cells.length,counts=new Float64Array(DISTRIBUTION_BINS),edges=Array.from({length:DISTRIBUTION_BINS+1},(_,i)=>Math.exp(i/DISTRIBUTION_BINS*Math.log(maxS+1)));
  for(const s of clusterSizes){const b=Math.min(DISTRIBUTION_BINS-1,Math.floor(Math.log(s)/Math.log(maxS+1)*DISTRIBUTION_BINS));counts[b]++;}
  for(let i=0;i<DISTRIBUTION_BINS;i++)distributionSum[i]+=counts[i]/Math.max(1,edges[i+1]-edges[i]);
  distributionSamples++;
}
function linearFit(xs,ys){const n=xs.length,mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n,den=xs.reduce((a,x)=>a+(x-mx)**2,0);if(!den)return null;const slope=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/den,intercept=my-slope*mx,sse=ys.reduce((a,y,i)=>a+(y-(intercept+slope*xs[i]))**2,0),sst=ys.reduce((a,y)=>a+(y-my)**2,0);return{slope,intercept,sse,r2:sst?1-sse/sst:1};}
function drawClusterDistribution(){
  const{c,w,h,d}=setupCanvas(ui.clusterPlot),left=48*d,right=14*d,top=12*d,bottom=30*d,plotW=w-left-right,plotH=h-top-bottom;
  c.strokeStyle='#aaa69c';c.lineWidth=d;c.beginPath();c.moveTo(left,top);c.lineTo(left,h-bottom);c.lineTo(w-right,h-bottom);c.stroke();c.fillStyle='#77766f';c.font=`${9*d}px DM Mono`;c.fillText('⟨N(s)⟩',3*d,14*d);c.fillText('s',w-13*d,h-8*d);
  if(!distributionSamples)return;
  const maxS=cells.length,edges=Array.from({length:DISTRIBUTION_BINS+1},(_,i)=>Math.exp(i/DISTRIBUTION_BINS*Math.log(maxS+1))),points=[];
  for(let i=0;i<DISTRIBUTION_BINS;i++){const value=distributionSum[i]/distributionSamples;if(value>0)points.push({s:Math.sqrt(edges[i]*edges[i+1]),n:value});}
  if(points.length<6){ui.fitLabel.textContent='FIT COLLECTING DATA';return;}const ys=points.map(p=>Math.log(p.n)),xMin=0,xMax=Math.log10(maxS),yMin=Math.min(...ys)/Math.LN10-.2,yMax=Math.max(...ys)/Math.LN10+.2,X=s=>left+(Math.log10(s)-xMin)/(xMax-xMin)*plotW,Y=v=>top+(yMax-Math.log10(v))/(yMax-yMin)*plotH;
  c.strokeStyle='rgba(34,77,56,.4)';c.lineWidth=1.5*d;c.beginPath();points.forEach((q,i)=>i?c.lineTo(X(q.s),Y(q.n)):c.moveTo(X(q.s),Y(q.n)));c.stroke();c.fillStyle='#224d38';for(const q of points){c.beginPath();c.arc(X(q.s),Y(q.n),2.6*d,0,Math.PI*2);c.fill();}
  let best=null;for(let k=3;k<=points.length-3;k++){const low=points.slice(0,k+1),high=points.slice(k),power=linearFit(low.map(q=>Math.log(q.s)),low.map(q=>Math.log(q.n))),exp=linearFit(high.map(q=>q.s),high.map(q=>Math.log(q.n)));if(!power||!exp||power.slope>=0||exp.slope>=0)continue;const score=power.sse+exp.sse+.02*(1/low.length+1/high.length);if(!best||score<best.score)best={k,power,exp,score};}
  if(best){const cut=points[best.k].s,lowStart=points[0].s,highEnd=points.at(-1).s,pow=s=>Math.exp(best.power.intercept)*s**best.power.slope,ex=s=>Math.exp(best.exp.intercept+best.exp.slope*s);c.lineWidth=2*d;c.setLineDash([6*d,4*d]);c.strokeStyle='#ed5a24';c.beginPath();c.moveTo(X(lowStart),Y(pow(lowStart)));c.lineTo(X(cut),Y(pow(cut)));c.stroke();c.strokeStyle='#8b5b91';c.beginPath();for(let j=0;j<=80;j++){const logS=Math.log(cut)+j/80*(Math.log(highEnd)-Math.log(cut)),s=Math.exp(logS),x=X(s),y=Y(ex(s));j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();c.setLineDash([]);c.strokeStyle='#77766f';c.lineWidth=d;c.beginPath();c.moveTo(X(cut),top);c.lineTo(X(cut),h-bottom);c.stroke();c.fillStyle='#77766f';c.fillText(`s_max ≈ ${cut.toFixed(0)}`,Math.min(w-70*d,X(cut)+5*d),top+10*d);ui.fitLabel.textContent=`POWER-LAW FIT τ=${best.power.slope.toFixed(2)} · R²=${best.power.r2.toFixed(2)}`;tauSum+=best.power.slope;cutoffSum+=cut;fitSamples++;ui.tauMetric.textContent=(tauSum/fitSamples).toFixed(2);ui.cutoffMetric.textContent=(cutoffSum/fitSamples).toFixed(0);ui.tauFitQuality.textContent=`R² ${best.power.r2.toFixed(2)}`;ui.cutoffFitCount.textContent=`${fitSamples} FITS`;}else{ui.fitLabel.textContent='FIT COLLECTING DATA';}
  ui.clusterSamples.textContent=`${distributionSamples.toLocaleString()} SNAPSHOTS`;
}
function frame(){if(running){for(let i=0;i<Number(ui.speed.value);i++)step();updateStats();draw();}requestAnimationFrame(frame);}
function setProbability(name,value,reset=false){const number=ui[`${name}Number`],slider=ui[name],v=Math.max(0,Math.min(1,Number(value)));if(!Number.isFinite(v))return;number.value=name==='p'?v.toFixed(3):v.toFixed(5);if(v<=Number(slider.max))slider.value=v;if(reset)initialize();else drawClusterDistribution();}
ui.p.addEventListener('input',()=>setProbability('p',ui.p.value));ui.f.addEventListener('input',()=>setProbability('f',ui.f.value));ui.pNumber.addEventListener('change',()=>setProbability('p',ui.pNumber.value,true));ui.fNumber.addEventListener('change',()=>setProbability('f',ui.fNumber.value,true));ui.speed.addEventListener('input',()=>ui.speedValue.textContent=`${ui.speed.value}×`);ui.size.addEventListener('input',()=>ui.sizeValue.textContent=ui.size.value);ui.size.addEventListener('change',initialize);ui.reset.addEventListener('click',initialize);ui.criticality.addEventListener('click',()=>{ui.p.value=.01;ui.f.value=.001;ui.pNumber.value='0.010';ui.fNumber.value='0.00100';initialize();});ui.toggle.addEventListener('click',()=>{running=!running;ui.toggleIcon.textContent=running?'Ⅱ':'▶';ui.toggleText.textContent=running?'Pause':'Run';});window.addEventListener('resize',()=>{drawSparkline();drawClusterDistribution();});
initialize();requestAnimationFrame(frame);
