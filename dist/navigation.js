// Perspective floor calibration and small navigation mesh, independent of rendering.
export function homography(src,dst){const a=[];for(let i=0;i<4;i++){let[x,z]=src[i],[u,v]=dst[i];a.push([x,z,1,0,0,0,-u*x,-u*z,u]);a.push([0,0,0,x,z,1,-v*x,-v*z,v]);}for(let k=0;k<8;k++){let pivot=k;for(let j=k+1;j<8;j++)if(Math.abs(a[j][k])>Math.abs(a[pivot][k]))pivot=j;[a[k],a[pivot]]=[a[pivot],a[k]];if(Math.abs(a[k][k])<1e-10)throw Error('Degenerate camera calibration');let p=a[k][k];for(let j=k;j<9;j++)a[k][j]/=p;for(let i=0;i<8;i++)if(i!==k){let f=a[i][k];for(let j=k;j<9;j++)a[i][j]-=f*a[k][j];}}return a.map(row=>row[8]).concat(1);}
export function project(h,x,z){let d=h[6]*x+h[7]*z+1;return{u:(h[0]*x+h[1]*z+h[2])/d,v:(h[3]*x+h[4]*z+h[5])/d,d};}
export function unproject(h,u,v){let a=h[0]-u*h[6],b=h[1]-u*h[7],c=u-h[2],d=h[3]-v*h[6],e=h[4]-v*h[7],f=v-h[5],q=a*e-b*d;if(Math.abs(q)<1e-10)return null;return{x:(c*e-b*f)/q,z:(a*f-c*d)/q};}
export function pointInPolygon(x,z,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){let a=poly[i],b=poly[j];if(((a[1]>z)!==(b[1]>z))&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function blocked(scene,x,z){if(!Number.isFinite(x+z)||x<scene.bounds[0]+.18||x>scene.bounds[1]-.18||z<.15||z>scene.length-.15)return true;if(scene.walkable&&!pointInPolygon(x,z,scene.walkable))return true;return scene.obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.18&&Math.abs(z-o.z)<o.d/2+.18);}
export function lineClear(scene,a,b){let steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.15);for(let i=0;i<=steps;i++){let t=i/Math.max(1,steps);if(blocked(scene,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}return true;}
export function route(scene,start,goal){if(blocked(scene,goal.x,goal.z))return[];if(lineClear(scene,start,goal))return[goal];let step=.4,key=p=>Math.round(p.x/step)+','+Math.round(p.z/step),s={x:Math.round(start.x/step)*step,z:Math.round(start.z/step)*step},queue=[s],seen=new Map([[key(s),null]]),end=null;for(let head=0;head<queue.length&&head<14000;head++){let p=queue[head];if(Math.hypot(p.x-goal.x,p.z-goal.z)<.65&&lineClear(scene,p,goal)){end=p;break;}for(let[dx,dz]of[[step,0],[-step,0],[0,step],[0,-step]]){let q={x:p.x+dx,z:p.z+dz},k=key(q);if(seen.has(k)||blocked(scene,q.x,q.z)||!lineClear(scene,p,q))continue;seen.set(k,p);queue.push(q);}}if(!end)return[];let path=[goal],p=end;while(p){path.unshift(p);p=seen.get(key(p));}path.shift();let clean=[],prev=start;for(let i=0;i<path.length;i++){if(i+1<path.length&&lineClear(scene,prev,path[i+1]))continue;clean.push(path[i]);prev=path[i];}return clean;}
const corners=(w,l)=>[[-w,0],[w,0],[w,l],[-w,l]];
export const scenes=[
{id:'street',name:'The side street',district:'LOW CITY',file:'street.png',length:25,bounds:[-3,3],spawn:{x:1.1,z:3},nearHeight:.18,walkable:[[-2.65,.3],[2.65,.3],[2.5,8],[2.25,16],[1.9,20],[1.45,24.7],[-1.45,24.7],[-1.7,20],[-1.9,15],[-2.3,10]],obstacles:[{x:-1.5,z:12.1,w:1,d:1.6}],floor:[[.52,1.03],[.82,1.03],[.66,.60],[.55,.60]],occlusion:[[[0,0],[.275,0],[.275,.565],[.289,.574],[.555,1],[0,1]]],exit:{x:0,z:23.4},exitLabel:'Continue toward the tower'},
{id:'plaza',name:'The studio approach',district:'BROADCAST PLAZA',file:'plaza.png',length:28,bounds:[-6,6],spawn:{x:-1.4,z:5},nearHeight:.20,walkable:[[-5.65,.3],[5.65,.3],[5.5,15],[5.4,20],[5.6,27.7],[-5.6,27.7],[-5.4,20],[-5.3,10]],obstacles:[{x:-5.3,z:4,w:.9,d:1.7}],floor:[[.22,1.05],[.91,1.05],[.85,.675],[.42,.675]],occlusion:[[[0,0],[.100,0],[.100,.67],[.145,.68],[.22,.82],[.22,.94],[.13,1],[0,1]]],exit:{x:0,z:26.8},exitLabel:'Enter Studio 001'}
];
scenes[0].masks=[
{polygon:[[0,.55],[.277,.55],[.545,1],[0,1]],depth:1.1},
{polygon:[[.274,.563],[.290,.574],[.557,1],[.531,1]],depth:1.1},
{polygon:[[.423,.728],[.458,.690],[.515,.717],[.527,.789],[.487,.832],[.441,.813]],depth:.835},
{polygon:[[.554,.674],[.573,.647],[.612,.660],[.620,.704],[.600,.739],[.560,.726]],depth:.740}];
scenes[1].masks=[{polygon:[[0,0],[.101,0],[.101,.670],[.145,.680],[.220,.820],[.220,.940],[.130,1],[0,1]],depth:1.1}];
scenes.push({id:'studio',name:'Studio 001',district:'DEAD AIR',file:'studio.png',length:17,bounds:[-4,4],spawn:{x:-1.7,z:3.3},nearHeight:.22,walkable:[[-3.7,.3],[3.7,.3],[3.3,9],[2.3,16.7],[-2.3,16.7],[-3.3,9]],obstacles:[],floor:[[.28,1.02],[.87,1.02],[.78,.62],[.50,.62]],masks:[{polygon:[[.12,.43],[.27,.44],[.275,.84],[.23,.88],[.12,.81]],depth:.88},{polygon:[[.83,.56],[.93,.54],[1,.57],[1,1],[.94,.98],[.94,.88],[.85,.84]],depth:.94}],exit:{x:0,z:14.8},exitLabel:'Use the mixing desk'});
for(let s of scenes){s.h=homography(corners(s.bounds[1],s.id==='plaza'?20:s.length),s.floor);if(s.id==='plaza')s.stairs=homography([[-6,20],[6,20],[6,28],[-6,28]],[[.42,.675],[.85,.675],[.82,.572],[.64,.572]]);}
export function screenPoint(scene,x,z){return project(scene.stairs&&z>20?scene.stairs:scene.h,x,z);}
export function groundPoint(scene,u,v){if(scene.stairs&&v<.675){let p=unproject(scene.stairs,u,v);if(p&&p.z>=20&&p.z<=28)return p;}return unproject(scene.h,u,v);}

export const interactables=[
{id:'notice',scene:0,label:'Read the curfew notice',x:2.0,z:4.0,reach:1.6,rect:[.825,.66,.89,.82]},
{id:'intercom',scene:0,label:'Listen to the service intercom',x:1.45,z:10.0,reach:1.7,rect:[.691,.66,.728,.72]},
{id:'breaker',scene:0,label:'Cut the service feed',x:1.4,z:17.3,reach:1.7,rect:[.651,.593,.684,.644]},
{id:'crossing',scene:0,label:'Cross toward the tower',x:0,z:23.4,reach:1.65,rect:[.55,.58,.67,.645]},
{id:'backStreet',scene:1,label:'Return to the side street',x:-1.4,z:2.3,reach:1.4,rect:null},
{id:'doors',scene:1,label:'Enter Studio 001',x:0,z:26.8,reach:1.6,rect:[.64,.42,.85,.595]},
{id:'backPlaza',scene:2,label:'Return to the plaza',x:-1.7,z:2.3,reach:1.4,rect:null},
{id:'monitor',scene:2,label:'Examine the studio monitor',x:0,z:14.8,reach:1.9,rect:[.64,.35,.83,.58]}
];
