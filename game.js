(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const screens = ['menuScreen', 'gameOverScreen', 'garageScreen'];
  const shell = $('gameShell');
  const skins = [
    { id: 'eclipse', name: 'ECLIPSE', color: '#d9b8ff', cost: 0 },
    { id: 'glitch', name: 'GLITCH', color: '#55f4e3', cost: 80 },
    { id: 'nova', name: 'NOVA', color: '#ff7be9', cost: 180 },
    { id: 'ember', name: 'EMBER', color: '#ff9b61', cost: 350 },
  ];
  const saved = (key, fallback) => { try { const v = localStorage.getItem('shadowrun-' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } };
  const store = (key, value) => { try { localStorage.setItem('shadowrun-' + key, JSON.stringify(value)); } catch {} };
  let best = saved('best', 0), energy = saved('energy', 0), unlocked = saved('unlocked', ['eclipse']), equipped = saved('equipped', 'eclipse');
  let muted = saved('muted', false), audio = null, W = 0, H = 0, dpr = 1, last = 0;
  let state = 'menu', score = 0, runOrbs = 0, elapsed = 0, speed = 300, spawnIn = 1, shake = 0;
  let player = { lane: 1, y: 0, fromY: 0, toY: 0, flip: 1, x: 0, trail: [] };
  let objects = [], particles = [], stars = [], dust = [], toastTimer = 0;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const color = () => skins.find(s => s.id === equipped)?.color || skins[0].color;
  function resize() {
    const r = shell.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.x = W * (W < 600 ? .24 : .255); player.y = laneY(player.lane);
    stars = Array.from({ length: Math.floor(W * H / 9500) }, () => ({ x: rand(0,W), y: rand(0,H), s: rand(.4,1.5), a: rand(.15,.55) }));
    dust = Array.from({ length: 34 }, () => ({ x: rand(0,W), y: rand(H*.19,H*.81), r: rand(.5,1.6), a: rand(.12,.42) }));
  }
  function laneY(lane) { return lane === 0 ? H * .205 + 18 : H * .795 - 20; }
  addEventListener('resize', resize); resize();
  function showScreen(name) { screens.forEach(id => $(id).classList.toggle('hidden', id !== name)); $('hud').classList.toggle('hidden', state !== 'playing'); }
  function setCurrency() { $('currencyValue').textContent = energy; $('garageCurrency').textContent = energy; }
  function updateBest() { $('menuBest').textContent = String(best).padStart(4,'0'); $('hudBest').textContent = String(best).padStart(4,'0'); }
  setCurrency(); updateBest(); $('soundButton').textContent = muted ? '♫̸' : '♫';

  function initAudio() { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (audio?.state === 'suspended') audio.resume(); }
  function beep(freq, duration, type = 'sine', volume = .045, slide = 0) {
    if (muted || !audio) return;
    try { const o = audio.createOscillator(), g = audio.createGain(), now = audio.currentTime; o.type = type; o.frequency.setValueAtTime(freq, now); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration); g.gain.setValueAtTime(volume, now); g.gain.exponentialRampToValueAtTime(.001, now + duration); o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now + duration); } catch {}
  }
  function flip() { if (state !== 'playing') return; player.lane = 1 - player.lane; player.fromY = player.y; player.toY = laneY(player.lane); player.flip = 0; burst(player.x, player.y, color(), 8, 1.5); beep(340, .11, 'triangle', .04, 360); }
  function burst(x, y, tint, count = 12, power = 1) {
    for (let i=0;i<count;i++) { const a = rand(0,Math.PI*2), s = rand(30,190)*power; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.25,.65),max:.65,r:rand(1.3,3.8),color:tint}); }
  }
  function startRun() {
    initAudio(); state = 'playing'; score = 0; runOrbs = 0; elapsed = 0; speed = 300; spawnIn = .65; objects = []; particles = []; shake = 0;
    player.lane = 1; player.x = W * (W < 600 ? .24 : .255); player.y = laneY(1); player.fromY = player.toY = player.y; player.flip = 1; player.trail = [];
    $('tapHint').style.opacity = '1'; $('progressBar').style.width = '0%'; showScreen(null); $('hud').classList.remove('hidden');
  }
  function endRun() {
    if (state !== 'playing') return; state = 'over'; shake = .7; burst(player.x,player.y,'#ff466c',34,2); beep(180,.42,'sawtooth',.07,-110);
    best = Math.max(best, Math.floor(score)); store('best',best); updateBest();
    $('finalScore').textContent = Math.floor(score).toLocaleString(); $('finalBest').textContent = best.toLocaleString(); $('runReward').innerHTML = `✦ <span>+${runOrbs} energy collected</span>`;
    $('hud').classList.add('hidden'); $('gameOverScreen').classList.remove('hidden');
  }
  function spawnGroup() {
    const baseX = W + 50, diff = clamp(elapsed / 90, 0, 1);
    const lane = Math.random() < .5 ? 0 : 1;
    const roll = Math.random();
    const types = roll < .28 ? 'spikes' : roll < .52 ? 'laser' : roll < .77 ? 'barrier' : 'electric';
    const size = types === 'laser' ? 18 : types === 'barrier' ? 27 : 24;
    objects.push({kind:'hazard', type:types, lane, x:baseX, w:size, h:types==='spikes'?25:types==='barrier'?46:28, phase:rand(0,6), amp:types==='barrier'?rand(15,31):0});
    if (Math.random() < .32 + diff*.15) objects.push({kind:'hazard', type:Math.random()<.5?'spikes':'electric', lane:1-lane, x:baseX+rand(155,215), w:24,h:25,phase:rand(0,6),amp:0});
    const orbLane = Math.random()<.7 ? 1-lane : lane;
    const count = 3 + Math.floor(Math.random()*3);
    for(let i=0;i<count;i++) objects.push({kind:'orb', lane:orbLane, x:baseX+105+i*34, w:14, phase:rand(0,6)});
    spawnIn = Math.max(.79, rand(1.16,1.62) - diff*.25);
  }
  function update(dt) {
    if (state === 'playing') {
      elapsed += dt; speed = Math.min(610, 300 + elapsed * 3.15); score += dt * (10 + elapsed*.09);
      spawnIn -= dt; if (spawnIn <= 0) spawnGroup();
      if (player.flip < 1) { player.flip = Math.min(1,player.flip + dt*9); const t=player.flip*player.flip*(3-2*player.flip); player.y=player.fromY+(player.toY-player.fromY)*t; }
      if (elapsed < 4) $('tapHint').style.opacity = String(clamp(1-elapsed/4,.2,.9));
      $('scoreValue').textContent = String(Math.floor(score)).padStart(4,'0'); $('progressBar').style.width = `${Math.min(100,elapsed/70*100)}%`;
      for (let i=objects.length-1;i>=0;i--) {
        const o=objects[i]; o.x -= speed*dt;
        if (o.kind==='hazard' && Math.abs(o.x-player.x)<o.w*.5+12 && player.lane===o.lane) { endRun(); break; }
        if (o.kind==='orb' && Math.abs(o.x-player.x)<20 && player.lane===o.lane) {
          objects.splice(i,1); score+=25; runOrbs++; energy++; store('energy',energy); setCurrency(); burst(o.x,laneY(o.lane),'#72ffed',8,1); beep(720,.13,'sine',.04,420); continue;
        }
        if (o.x < -70) objects.splice(i,1);
      }
      player.trail.unshift({x:player.x-7,y:player.y,a:1}); if(player.trail.length>8)player.trail.pop();
      for(const p of player.trail)p.a-=dt*2.7;
      if (Math.random()<dt*2.4) dust.push({x:W+4,y:rand(H*.21,H*.79),r:rand(.6,1.8),a:rand(.15,.55)});
    }
    for (let i=particles.length-1;i>=0;i--) { const p=particles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.97; p.vy*=.97; p.life-=dt; if(p.life<=0)particles.splice(i,1); }
    for(const d of dust){ d.x-= (state==='playing'?speed*.55:35)*dt; if(d.x<0){d.x=W+rand(0,40);d.y=rand(H*.19,H*.81);} }
    shake=Math.max(0,shake-dt*1.7);
  }
  function glowLine(x1,y1,x2,y2,stroke,width=1,blur=0) { ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.shadowColor=stroke;ctx.shadowBlur=blur;ctx.stroke();ctx.shadowBlur=0; }
  function drawBackground(t) {
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#111024');bg.addColorStop(.48,'#111025');bg.addColorStop(1,'#0c0b1c');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    const cx=W*.59,cy=H*.5;const halo=ctx.createRadialGradient(cx,cy,4,cx,cy,Math.max(W,H)*.65);halo.addColorStop(0,'rgba(87,48,153,.22)');halo.addColorStop(.48,'rgba(31,23,66,.14)');halo.addColorStop(1,'rgba(4,4,12,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,W,H);
    for(const s of stars){ctx.globalAlpha=s.a*(.72+.28*Math.sin(t*.8+s.y));ctx.fillStyle='#c9c4ff';ctx.fillRect(s.x,s.y,s.s,s.s);}ctx.globalAlpha=1;
    for(const d of dust){ctx.globalAlpha=d.a;ctx.fillStyle='#8c82bd';ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    const top=H*.18,bottom=H*.82,van=W*.64;
    ctx.fillStyle='rgba(18,16,39,.63)';ctx.beginPath();ctx.moveTo(0,top);ctx.lineTo(W,top);ctx.lineTo(W,bottom);ctx.lineTo(0,bottom);ctx.closePath();ctx.fill();
    const shift=(t*(state==='playing'?speed*.27:36))%74;
    for(let i=0;i<12;i++){const x=((i*74-shift)% (W+74)+W+74)%(W+74);ctx.globalAlpha=.1+(i%3)*.035;glowLine(x,top,x,bottom,i%3===0?'#9875ff':'#5563a8',1);}
    ctx.globalAlpha=1;
    for(let i=1;i<7;i++){const p=i/7,y=top+(bottom-top)*p;glowLine(0,y,W,y,`rgba(119,103,182,${.07+(1-p)*.08})`,1);}
    for(let i=0;i<8;i++){const x=(i/8)*W;glowLine(van,cy,x,top,'rgba(116,103,181,.18)',1);glowLine(van,cy,x,bottom,'rgba(116,103,181,.18)',1);}
    // Safe running rails and illuminated tunnel edges.
    const pulse=.7+.3*Math.sin(t*2.2);glowLine(0,top,W,top,'#9b69ff',2,14);glowLine(0,bottom,W,bottom,'#6961ff',2,15);
    glowLine(0,top+7,W,top+7,`rgba(193,137,255,${.18*pulse})`,1,5);glowLine(0,bottom-7,W,bottom-7,`rgba(100,113,255,${.18*pulse})`,1,5);
    const scan=(t*90)%(W+220)-110;ctx.fillStyle='rgba(147,114,255,.025)';ctx.fillRect(scan,top,70,bottom-top);
    // distant warning lights along the tunnel.
    for(let i=0;i<5;i++){const x=(i*W/4-(t*45)% (W/4)+W/4)%(W+20);ctx.fillStyle=`rgba(92,244,227,${.22+.2*Math.sin(t*3+i)})`;ctx.fillRect(x,top+2,2,3);ctx.fillRect(x,bottom-5,2,3);}
  }
  function drawOrb(o,t){const y=laneY(o.lane)+Math.sin(t*5+o.phase)*4,r=7+Math.sin(t*6+o.phase)*1.2;ctx.save();ctx.translate(o.x,y);ctx.rotate(t*1.8+o.phase);ctx.shadowColor='#65fff0';ctx.shadowBlur=19;ctx.fillStyle='#a5fff4';ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.72,0);ctx.lineTo(0,r);ctx.lineTo(-r*.72,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#f6ffff';ctx.fillRect(-1,-2,2,4);ctx.restore();}
  function drawHazard(o,t){
    const y=laneY(o.lane)+(o.type==='barrier'?Math.sin(t*3+o.phase)*o.amp:0), top=o.lane===0, neon=o.type==='laser'?'#ff466c':o.type==='electric'?'#55f4e3':'#ff516f';
    ctx.save();ctx.shadowColor=neon;ctx.shadowBlur=15;
    if(o.type==='spikes'){
      ctx.fillStyle='rgba(255,60,101,.84)';ctx.strokeStyle='#ff8ba5';ctx.lineWidth=1.2;ctx.beginPath();
      if(top){ctx.moveTo(o.x-o.w/2,y-13);ctx.lineTo(o.x-o.w/2,y+7);ctx.lineTo(o.x,y+24);ctx.lineTo(o.x+o.w/2,y+7);ctx.lineTo(o.x+o.w/2,y-13);}else{ctx.moveTo(o.x-o.w/2,y+13);ctx.lineTo(o.x-o.w/2,y-7);ctx.lineTo(o.x,y-24);ctx.lineTo(o.x+o.w/2,y-7);ctx.lineTo(o.x+o.w/2,y+13);}ctx.closePath();ctx.fill();ctx.stroke();
    } else if(o.type==='laser') {
      const railY=top?H*.18+8:H*.82-8, beamY=top?y+18:y-18;ctx.fillStyle='#ff5777';ctx.fillRect(o.x-o.w/2,railY-3,o.w,6);ctx.fillStyle='#ffd2dd';ctx.fillRect(o.x-o.w/2,railY-1,o.w,2);ctx.globalAlpha=.27;ctx.fillStyle=neon;ctx.fillRect(o.x-4,Math.min(railY,beamY),8,Math.abs(beamY-railY));ctx.globalAlpha=1;glowLine(o.x,railY,o.x,beamY,neon,3,18);ctx.fillStyle='#ffe2e9';ctx.beginPath();ctx.arc(o.x,beamY,3,0,Math.PI*2);ctx.fill();
    } else if(o.type==='barrier') {
      ctx.fillStyle='rgba(255,65,103,.88)';ctx.strokeStyle='#ffa0b2';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(o.x-o.w/2,y-19,o.w,38,3);ctx.fill();ctx.stroke();ctx.fillStyle='rgba(38,13,39,.8)';for(let j=-1;j<2;j++)ctx.fillRect(o.x-8+j*9,y-14,4,28);glowLine(o.x-o.w/2-5,y-23,o.x+o.w/2+5,y-23,neon,2,9);
    } else {
      ctx.fillStyle='rgba(54,246,225,.12)';ctx.fillRect(o.x-o.w/2,y-17,o.w,34);ctx.strokeStyle='rgba(113,255,238,.85)';ctx.lineWidth=1;ctx.strokeRect(o.x-o.w/2,y-17,o.w,34);
      for(let j=0;j<4;j++){const xx=o.x-o.w/2+j*8+3;const wob=Math.sin(t*12+o.phase+j)*5;ctx.beginPath();ctx.moveTo(xx,y-13);ctx.lineTo(xx+wob,y);ctx.lineTo(xx,y+13);ctx.strokeStyle='#aafff4';ctx.lineWidth=1.5;ctx.shadowBlur=9;ctx.stroke();}
    }
    ctx.restore();
  }
  function drawPlayer(t) {
    if(state==='menu') { player.x=W*(W<600?.72:.69); player.y=laneY(1)+Math.sin(t*2.7)*3; }
    else if(state==='over') { player.y=laneY(player.lane); }
    const tint=color(), lane=player.lane;ctx.save();ctx.translate(player.x,player.y);if(lane===0)ctx.rotate(Math.PI);
    for(const tr of player.trail){if(tr.a<=0)continue;ctx.globalAlpha=tr.a*.33;ctx.fillStyle=tint;ctx.shadowColor=tint;ctx.shadowBlur=15;ctx.beginPath();ctx.ellipse(tr.x-player.x-5,tr.y-player.y,8*tr.a,4*tr.a,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    const run=Math.sin(t*15)*2.5;
    ctx.shadowColor=tint;ctx.shadowBlur=22;ctx.fillStyle=tint;
    // compact shadow runner: bright head, tapered body, and little running legs
    ctx.beginPath();ctx.ellipse(0,-8,8,9,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-7,-3);ctx.quadraticCurveTo(-11,7,-5,13);ctx.quadraticCurveTo(0,17,7,10);ctx.lineTo(5,-3);ctx.closePath();ctx.fill();
    ctx.lineWidth=3.2;ctx.lineCap='round';ctx.strokeStyle=tint;ctx.beginPath();ctx.moveTo(-3,10);ctx.lineTo(-5+run,17);ctx.moveTo(3,10);ctx.lineTo(5-run,17);ctx.stroke();
    ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(3,-9,1.35,1.8,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function render(now) {
    const t=now/1000;ctx.save();if(shake>0)ctx.translate(rand(-shake*8,shake*8),rand(-shake*6,shake*6));
    drawBackground(t);
    for(const o of objects){if(o.kind==='orb')drawOrb(o,t);else drawHazard(o,t);}
    drawPlayer(t);
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.shadowBlur=0;
    // subtle central lane marker and a warning glow around an incoming threat
    if(state==='playing'){const danger=objects.some(o=>o.kind==='hazard'&&o.lane===player.lane&&o.x>player.x&&o.x-player.x<145);if(danger){ctx.globalAlpha=.12+.1*Math.sin(t*18);ctx.fillStyle='#ff3e69';ctx.fillRect(0,H*.18,5,H*.64);ctx.globalAlpha=1;}}
    ctx.restore();
  }
  function frame(now) { const dt=Math.min(.04,(now-last)/1000||0);last=now;update(dt);render(now);requestAnimationFrame(frame); }
  requestAnimationFrame(frame);

  function buildGarage() {
    const list=$('skinList');list.innerHTML='';
    for(const s of skins){const owned=unlocked.includes(s.id),active=equipped===s.id,button=document.createElement('button');button.className='skin-card'+(active?' selected':'');button.innerHTML=`<i class="skin-swatch" style="background:${s.color};color:${s.color}"></i><span class="skin-name">${s.name}</span><span class="skin-cost">${active?'EQUIPPED':owned?'OWNED':`✦ ${s.cost}`}</span>`;
      button.addEventListener('click',()=>{initAudio();if(owned){equipped=s.id;store('equipped',equipped);$('previewShadow').style.background=s.color;$('previewShadow').style.boxShadow=`0 0 22px ${s.color},0 0 60px ${s.color}`;$('previewLabel').innerHTML=`${s.name} <span>— EQUIPPED</span>`;buildGarage();beep(540,.1,'sine',.035,250);}else if(energy>=s.cost){energy-=s.cost;unlocked.push(s.id);store('energy',energy);store('unlocked',unlocked);setCurrency();buildGarage();toast(`${s.name} unlocked — make it yours`);beep(620,.18,'triangle',.04,420);}else toast(`Need ${s.cost-energy} more energy to unlock ${s.name}`);});list.appendChild(button);
    }
    const active=skins.find(s=>s.id===equipped)||skins[0];$('previewShadow').style.background=active.color;$('previewShadow').style.boxShadow=`0 0 22px ${active.color},0 0 60px ${active.color}`;$('previewLabel').innerHTML=`${active.name} <span>— EQUIPPED</span>`;$('garageCurrency').textContent=energy;
  }
  function toast(message){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),1900);}
  function goMenu(){state='menu';objects=[];particles=[];$('gameOverScreen').classList.add('hidden');$('garageScreen').classList.add('hidden');$('menuScreen').classList.remove('hidden');$('hud').classList.add('hidden');}
  $('playButton').addEventListener('click',startRun);$('restartButton').addEventListener('click',startRun);$('menuButton').addEventListener('click',goMenu);$('homeButton').addEventListener('click',e=>{e.preventDefault();if(state==='playing'){state='menu';$('hud').classList.add('hidden');$('menuScreen').classList.remove('hidden');objects=[];}else goMenu();});
  $('openSkins').addEventListener('click',()=>{buildGarage();$('menuScreen').classList.add('hidden');$('garageScreen').classList.remove('hidden');});
  $('closeSkins').addEventListener('click',()=>{$('garageScreen').classList.add('hidden');$('menuScreen').classList.remove('hidden');});
  $('soundButton').addEventListener('click',()=>{muted=!muted;store('muted',muted);$('soundButton').textContent=muted?'♫̸':'♫';if(!muted){initAudio();beep(500,.1,'sine',.035,200);}});
  shell.addEventListener('pointerdown',e=>{if(state==='playing'&&!e.target.closest('button,a')){e.preventDefault();flip();}},{passive:false});
  addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='ArrowUp'){if(state==='playing'){e.preventDefault();flip();}else if(state==='menu'&&e.code==='Space')startRun();}});
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
})();
