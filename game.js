// ============================================================
// NOVA RIFT: CHRONO SAGA — GAME ENGINE
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Adapt the canvas's internal resolution to the device's aspect ratio.
// On a narrow/portrait screen (most phones), a fixed 960x540 canvas gets
// scaled down so much by the browser that the player sprite becomes tiny.
// Instead we pick an internal resolution that better matches the screen's
// own aspect ratio, so the camera "zooms in" appropriately and everything
// on screen — especially the player — stays a comfortable, readable size.
function computeCanvasSize(){
  const screenRatio = window.innerWidth / window.innerHeight;
  if (screenRatio >= 1.2) {
    // landscape / desktop: use the original wide view
    return {w:960, h:540};
  } else if (screenRatio >= 0.75) {
    // near-square (tablets, small landscape phones)
    return {w:720, h:640};
  } else {
    // tall portrait phone: narrower, taller internal viewport
    return {w:540, h:760};
  }
}
const CANVAS_SIZE = computeCanvasSize();
canvas.width = CANVAS_SIZE.w;
canvas.height = CANVAS_SIZE.h;
let W = canvas.width, H = canvas.height;

let unlockedLevel = 0;
let levelStars = {};
try {
  unlockedLevel = parseInt(localStorage.getItem('nr_unlocked')||'0');
  levelStars = JSON.parse(localStorage.getItem('nr_stars')||'{}');
} catch(e){}
function saveProgress(){
  try{
    localStorage.setItem('nr_unlocked', String(unlockedLevel));
    localStorage.setItem('nr_stars', JSON.stringify(levelStars));
  }catch(e){}
}

const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyE"].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e=> keys[e.code]=false);

function bindTouch(id, downKey){
  const el = document.getElementById(id);
  const set = v => { keys[downKey]=v; };
  el.addEventListener('touchstart', e=>{e.preventDefault(); set(true);}, {passive:false});
  el.addEventListener('touchend', e=>{e.preventDefault(); set(false);}, {passive:false});
  el.addEventListener('mousedown', e=>{e.preventDefault(); set(true);});
  el.addEventListener('mouseup', e=>{e.preventDefault(); set(false);});
  el.addEventListener('mouseleave', e=> set(false));
}
bindTouch('btnLeft','ArrowLeft');
bindTouch('btnRight','ArrowRight');
bindTouch('btnJump','Space');
bindTouch('btnRun','ShiftLeft');
bindTouch('btnAbility','KeyE');

let state = 'title';
let currentLevelIndex = 0;
let level = null;
let camX = 0;
let particles = [];
let floatingTexts = [];

const player = {
  x:0,y:0,w:26,h:34,vx:0,vy:0,
  onGround:false, facing:1, power:'small',
  invincible:0, starTime:0, lives:3, shards:0, score:0,
  hurtTime:0, crouching:false, jumping:false,
  shieldHits:0, flying:0,
  magnetTime:0, rocketTime:0,
};

let elapsedTime = 0;
let timeLeft = 300;

const screens = ['titleScreen','howtoScreen','levelSelectScreen','pauseScreen','winScreen','loseScreen','allClearScreen'];
function showScreen(id){
  screens.forEach(s => document.getElementById(s).classList.toggle('hidden', s!==id));
  document.getElementById('hudBar').classList.toggle('hidden', id!=='');
}
function hideAllScreens(){
  screens.forEach(s => document.getElementById(s).classList.add('hidden'));
}

document.getElementById('startBtn').onclick = () => { playSfx('select'); buildLevelGrid(); showScreen('levelSelectScreen'); };
document.getElementById('howtoBtn').onclick = () => showScreen('howtoScreen');
document.getElementById('backFromHowto').onclick = () => showScreen('titleScreen');
document.getElementById('backToTitle').onclick = () => showScreen('titleScreen');
document.getElementById('resumeBtn').onclick = () => resumeGame();
document.getElementById('restartLevelBtn').onclick = () => startLevel(currentLevelIndex);
document.getElementById('quitToMenuBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); document.getElementById('pauseBtn').classList.add('hidden'); document.getElementById('musicBtn').classList.add('hidden'); document.getElementById('sfxBtn').classList.add('hidden'); stopMusic(); };
document.getElementById('nextLevelBtn').onclick = () => {
  if (currentLevelIndex < 19) startLevel(currentLevelIndex+1);
  else { hideAllScreens(); showScreen('allClearScreen'); }
};
document.getElementById('menuFromWinBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); document.getElementById('pauseBtn').classList.add('hidden'); document.getElementById('musicBtn').classList.add('hidden'); document.getElementById('sfxBtn').classList.add('hidden'); stopMusic(); };
document.getElementById('retryBtn').onclick = () => startLevel(currentLevelIndex);
document.getElementById('menuFromLoseBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); document.getElementById('pauseBtn').classList.add('hidden'); document.getElementById('musicBtn').classList.add('hidden'); document.getElementById('sfxBtn').classList.add('hidden'); stopMusic(); };
document.getElementById('allClearMenuBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); };
document.getElementById('pauseBtn').onclick = () => pauseGame();
document.getElementById('musicBtn').onclick = () => { toggleMusic(); document.getElementById('musicBtn').textContent = musicOn?'🎵':'🔇'; };
document.getElementById('sfxBtn').onclick = () => { toggleSfx(); document.getElementById('sfxBtn').textContent = sfxOn?'🔊':'🔈'; playSfx('select'); };

function buildLevelGrid(){
  const grid = document.getElementById('levelGrid');
  grid.innerHTML = '';
  for (let i=0;i<20;i++){
    const meta = ALL_LEVELS_META[i];
    const btn = document.createElement('div');
    const locked = i > unlockedLevel;
    btn.className = 'lvlBtn' + (locked ? ' locked':'');
    const stars = levelStars[i]||0;
    btn.innerHTML = `${meta.isBoss?'👑':meta.world+'-'+meta.stage}<div class="stars">${locked?'🔒':'⭐'.repeat(stars)}</div>`;
    if (!locked) btn.onclick = () => startLevel(i);
    grid.appendChild(btn);
  }
}

function pauseGame(){ if(state==='playing'){ state='paused'; showScreen('pauseScreen'); playSfx('pause'); stopMusic(); } }
function resumeGame(){ state='playing'; hideAllScreens(); document.getElementById('pauseBtn').classList.remove('hidden'); startMusic(level.worldNum-1); }

window.addEventListener('keydown', e=>{
  if (e.code==='Escape' || e.code==='KeyP'){
    if (state==='playing') pauseGame();
    else if (state==='paused') resumeGame();
  }
});

function startLevel(idx){
  currentLevelIndex = idx;
  level = buildLevel(idx);
  level.entities = JSON.parse(JSON.stringify(level.entities));
  level.entities.enemies.forEach(e=>{ e.alive=true; e.hp = e.type==='crossbowman'||e.type==='battlerook'?2:1; e.dir=-1; e.vy=0; e.baseX=e.x; e.baseY=e.y; e.t=Math.random()*100; });
  level.entities.shards.forEach(c=> c.collected=false);
  level.entities.powerups.forEach(p=> p.collected=false);
  level.boss = level.boss ? {...level.boss, alive:true, hitCooldown:0} : null;

  player.x = 2*TILE; player.y = (level.groundY-3)*TILE;
  player.vx=0; player.vy=0; player.onGround=false; player.facing=1;
  player.power = 'small'; player.invincible=90; player.hurtTime=0; player.lives=3;
  player.shards=0; player.starTime=0; player.shieldHits=0;
  player.magnetTime=0; player.rocketTime=0;
  timeLeft = level.timeLimit;
  elapsedTime=0;
  particles = []; floatingTexts=[];
  camX=0;
  state='playing';
  hideAllScreens();
  document.getElementById('pauseBtn').classList.remove('hidden');
  document.getElementById('musicBtn').classList.remove('hidden');
  document.getElementById('sfxBtn').classList.remove('hidden');
  document.getElementById('hudBar').classList.remove('hidden');
  document.getElementById('levelLabel').textContent = `Age ${level.worldNum}-${level.stageNum}`;
  showMsg(level.name, 1600);
  updatePowerIcon();
  try { startMusic(level.worldNum-1); } catch(e){}
  if (level.isBoss) setTimeout(()=>{ playSfx('bossRoar'); showMsg(level.boss.name, 2200); }, 900);
  draw();
}

function showMsg(txt, ms){
  const el = document.getElementById('msgOverlay');
  el.textContent = txt;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.style.opacity=0, ms);
}

function updatePowerIcon(){
  const hearts = document.getElementById('hearts');
  const label = {small:'Base 🙂',overcharge:'Overcharge ⚡',embercore:'Ember Core 🔥',chronostar:'CHRONO STAR 🌟',skywisp:'Sky Wisp 🪽',aegis:'Aegis 🛡️',surgeboots:'Surge Boots 💨'}[player.power];
  let extras = '';
  if (player.magnetTime>0) extras += ' 🧲';
  hearts.textContent = label + extras + '  ❤️'.repeat(player.lives);
  const ab = document.getElementById('abilityLabel');
  ab.textContent = player.power==='embercore' ? '[E] Fireball' : '';
}

// ---------- Physics constants ----------
const GRAVITY = 0.62;
const MOVE_ACC = 0.6;
const MAX_SPEED = 4.6;
const RUN_SPEED = 7.2;
const FRICTION = 0.72;
const JUMP_V = -12.6;
const JUMP_HOLD = 0.42;

function tileAt(tx,ty){
  if (ty<0||ty>=level.height||tx<0||tx>=level.width) return 0;
  return level.tiles[ty][tx];
}
function solidTile(v){ return v===1||v===2||v===3||v===4||v===5||v===9; }

function rectVsTiles(px,py,pw,ph, callback){
  const x0=Math.floor(px/TILE), x1=Math.floor((px+pw)/TILE);
  const y0=Math.floor(py/TILE), y1=Math.floor((py+ph)/TILE);
  for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++){
    const v = tileAt(tx,ty);
    if (v) callback(tx,ty,v);
  }
}

function hitBlock(tx,ty,v){
  if (v===3){ level.tiles[ty][tx]=0; spawnShardPop(tx*TILE+16, ty*TILE); player.shards++; player.score+=100; }
  else if (v===4){ level.tiles[ty][tx]=2; spawnPowerFromBlock(tx*TILE, ty*TILE-TILE); }
  else if (v===2 && player.power!=='small'){ level.tiles[ty][tx]=0; spawnBrickBits(tx*TILE,ty*TILE); player.score+=50; }
}

function spawnShardPop(x,y){
  particles.push({type:'shardpop', x,y, vy:-6, life:30});
  floatingTexts.push({x,y,text:'+100',life:40,vy:-1});
}
function spawnBrickBits(x,y){
  for(let i=0;i<4;i++) particles.push({type:'brick', x:x+16,y:y+16, vx:(Math.random()-0.5)*6, vy:-6-Math.random()*3, life:40});
}
function spawnPowerFromBlock(x,y){
  const pool = player.power==='small' ? ['overcharge'] : ['embercore','skywisp','chronostar','aegis'];
  const t = pool[Math.floor(Math.random()*pool.length)];
  level.entities.powerups.push({x,y,type:t,collected:false,rising:8,vx: t==='overcharge'?1.5:0});
}

// ---------- Player update ----------
function updatePlayer(){
  const left = keys['ArrowLeft']||keys['KeyA'];
  const right = keys['ArrowRight']||keys['KeyD'];
  const running = keys['ShiftLeft']||keys['ShiftRight'];
  const jumpKey = keys['Space']||keys['ArrowUp']||keys['KeyW'];
  const downKey = keys['ArrowDown']||keys['KeyS'];
  const abilityKey = keys['KeyE'];

  const topSpeed = (running ? RUN_SPEED : MAX_SPEED) * (player.power==='surgeboots'?1.6:1);
  if (left && !right){ player.vx -= MOVE_ACC; player.facing=-1; }
  else if (right && !left){ player.vx += MOVE_ACC; player.facing=1; }
  else { player.vx *= FRICTION; if (Math.abs(player.vx)<0.05) player.vx=0; }
  player.vx = Math.max(-topSpeed, Math.min(topSpeed, player.vx));

  player.crouching = downKey && player.onGround && player.power!=='small';

  if (jumpKey && player.onGround && !player.jumpLock){
    player.vy = JUMP_V;
    player.onGround=false;
    player.jumpHeld = true;
    player.jumpLock = true;
    playSfx('jump');
  }
  if (!jumpKey) { player.jumpHeld=false; player.jumpLock=false; }
  if (player.jumpHeld && player.vy<0) player.vy -= JUMP_HOLD;

  if (player.power==='skywisp' && jumpKey && player.vy>1 && player.flying>0){
    player.vy *= 0.85; player.flying--;
  }
  if (player.onGround) player.flying = player.power==='skywisp'?40:0;

  if (abilityKey && !player.abilityLock && player.power==='embercore'){
    player.abilityLock = true;
    level.entities.enemies.push({type:'fireball', x:player.x+player.facing*10, y:player.y+10, dir:player.facing, alive:true, life:90, playerOwned:true});
    playSfx('fireball');
  }
  if (!abilityKey) player.abilityLock = false;

  player.vy += GRAVITY;
  if (player.rocketTime>0){
    player.vy -= GRAVITY*1.5;
    if (jumpKey) player.vy -= 0.3;
  }
  if (player.vy>16) player.vy=16;

  const speed = player.crouching ? player.vx*0.3 : player.vx;
  let nx = player.x + speed;
  const pw = player.w, ph = player.crouching? player.h*0.6: (player.power==='small'?player.h*0.72:player.h);
  const py = player.y + (player.h-ph);
  let blocked=false;
  rectVsTiles(nx + (speed>0?pw*0.3:-pw*0.3), py+2, pw*0.4, ph-4, (tx,ty,v)=>{
    if (solidTile(v)) blocked=true;
  });
  if (!blocked) player.x = nx; else player.vx=0;

  let ny = player.y + player.vy;
  player.onGround=false;
  if (player.vy>0){
    rectVsTiles(player.x+4, ny+ph-2, pw-8, 4, (tx,ty,v)=>{
      if (solidTile(v)){ ny = ty*TILE - ph; player.vy=0; player.onGround=true; }
    });
  } else if (player.vy<0){
    rectVsTiles(player.x+4, ny, pw-8, 4, (tx,ty,v)=>{
      if (solidTile(v)){ ny = (ty+1)*TILE; player.vy=1; hitBlock(tx,ty,v); }
    });
  }
  player.y = ny;

  if (player.y > level.height*TILE + 100) killPlayer();
  if (player.x<0) player.x=0;
  if (player.x > level.width*TILE - pw) player.x = level.width*TILE-pw;

  if (player.invincible>0) player.invincible--;
  if (player.starTime>0){ player.starTime--; if(player.starTime===0) player.power = player._prevPower||'small'; }
  if (player.hurtTime>0) player.hurtTime--;
  if (player.magnetTime>0) player.magnetTime--;
  if (player.rocketTime>0) player.rocketTime--;

  const targetCam = player.x - W*0.4;
  camX += (targetCam-camX)*0.15;
  camX = Math.max(0, Math.min(level.width*TILE - W, camX));

  if (player.x > level.goal.x && !level.isBoss){ winLevel(); }
  if (level.isBoss && level.boss && !level.boss.alive && player.x > level.boss.x){ winLevel(); }
}

function killPlayer(){
  if (player.hurtTime>0 || player.invincible>200) return;
  if (player.power!=='small'){
    player.power = 'small'; player.invincible=90; player.hurtTime=60;
    floatingTexts.push({x:player.x,y:player.y,text:'Ouch!',life:40,vy:-1});
    playSfx('hurt');
    return;
  }
  player.lives--;
  playSfx('death');
  if (player.lives<=0){ loseLevel(); }
  else {
    player.x = Math.max(2*TILE, camX+50);
    player.y = (level.groundY-3)*TILE;
    player.vx=0; player.vy=0; player.invincible=120; player.hurtTime=60;
  }
}

function winLevel(){
  state='win';
  stopMusic();
  const timeBonus = Math.floor(timeLeft*3);
  player.score += timeBonus;
  const stars = timeLeft > level.timeLimit*0.6 ? 3 : timeLeft>level.timeLimit*0.3 ? 2 : 1;
  levelStars[currentLevelIndex] = Math.max(levelStars[currentLevelIndex]||0, stars);
  if (currentLevelIndex >= unlockedLevel && unlockedLevel<19) unlockedLevel = currentLevelIndex+1;
  saveProgress();
  document.getElementById('winStats').innerHTML = `Shards: ${player.shards} 💎 &nbsp;|&nbsp; Score: ${player.score} &nbsp;|&nbsp; ${'⭐'.repeat(stars)}`;
  document.getElementById('pauseBtn').classList.add('hidden');
  document.getElementById('musicBtn').classList.add('hidden');
  document.getElementById('sfxBtn').classList.add('hidden');
  document.getElementById('nextLevelBtn').style.display = currentLevelIndex<19 ? 'inline-block':'none';
  showScreen('winScreen');
  playSfx('win');
}
function loseLevel(){
  state='lose';
  stopMusic();
  document.getElementById('loseStats').textContent = `Score: ${player.score} — Try again!`;
  document.getElementById('pauseBtn').classList.add('hidden');
  document.getElementById('musicBtn').classList.add('hidden');
  document.getElementById('sfxBtn').classList.add('hidden');
  showScreen('loseScreen');
}

// ---------- Enemy AI ----------
function updateEnemies(){
  for (const e of level.entities.enemies){
    if (!e.alive) continue;
    if (e.frozenT>0){ e.frozenT--; collideEnemyPlayer(e); continue; }
    e.t += 1/60;
    switch(e.type){
      case 'raptorling': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        let nx = e.x + e.dir*1.4;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*1.4; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'tuskcharger': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        const dist = player.x-e.x;
        e.charging = Math.abs(dist)<220;
        const spd = e.charging ? 3.6 : 0.8;
        e.dir = e.charging ? Math.sign(dist) : e.dir;
        let nx = e.x + e.dir*spd;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*spd; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'direwasp': {
        e.baseX = e.baseX!=null?e.baseX:e.x; e.baseY = e.baseY!=null?e.baseY:e.y;
        e.x = e.baseX + Math.sin(e.t*1.6)*(e.range||70);
        e.y = e.baseY + Math.sin(e.t*3.2)*14;
        break;
      }
      case 'pikeman': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        let nx = e.x + e.dir*1.0;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*1.0; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'battlerook': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        let nx = e.x + e.dir*0.6;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*0.6; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'crossbowman': {
        e.shootT=(e.shootT||0)+1;
        if (e.shootT>120 && Math.abs(player.x-e.x)<380){
          e.shootT=0;
          level.entities.enemies.push({type:'bolt', x:e.x, y:e.y+6, dir: player.x<e.x?-1:1, alive:true, life:180});
        }
        break;
      }
      case 'netbot': {
        e.baseX=e.baseX!=null?e.baseX:e.x; e.baseY=e.baseY!=null?e.baseY:e.y;
        const dist = player.x-e.x;
        if (Math.abs(dist)<180){ e.x += Math.sign(dist)*0.9; e.y += Math.sign(player.y-e.y)*0.6; }
        else { e.x = e.baseX+Math.sin(e.t*0.9)*(e.range||70); e.y = e.baseY+Math.sin(e.t*2.4)*10; }
        break;
      }
      case 'glitchhound': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        e.blinkT=(e.blinkT||0)+1;
        if (e.blinkT>70){ e.blinkT=0; e.x += e.dir*40; }
        let nx = e.x + e.dir*1.8;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*1.8; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'turretDrone': {
        e.shootT=(e.shootT||0)+1;
        if (e.shootT>100 && Math.abs(player.x-e.x)<400){
          e.shootT=0;
          level.entities.enemies.push({type:'laser', x:e.x, y:e.y+8, dir: player.x<e.x?-1:1, alive:true, life:160});
        }
        break;
      }
      case 'anglerfin': {
        e.baseX=e.baseX!=null?e.baseX:e.x; e.baseY=e.baseY!=null?e.baseY:e.y;
        const dist = player.x-e.x;
        e.dir = Math.abs(dist)<240 ? Math.sign(dist) : e.dir;
        e.x += e.dir*1.3;
        e.y = e.baseY + Math.sin(e.t*1.4)*20;
        break;
      }
      case 'eeltrap': {
        e.homeY = e.homeY!=null?e.homeY:e.y;
        e.y = e.homeY + Math.sin(e.t*1.1)*18 - 18;
        break;
      }
      case 'jellydrifter': {
        e.baseX=e.baseX!=null?e.baseX:e.x; e.baseY=e.baseY!=null?e.baseY:e.y;
        e.x = e.baseX + Math.sin(e.t*0.7)*(e.range||60);
        e.y = e.baseY + Math.sin(e.t*1.3)*24;
        break;
      }
      case 'voidmite': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        e.burstT=(e.burstT||0)+1;
        const spd = e.burstT%90<20 ? 3.4 : 1.0;
        let nx = e.x + e.dir*spd;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*spd; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'starlancer': {
        e.baseX=e.baseX!=null?e.baseX:e.x; e.baseY=e.baseY!=null?e.baseY:e.y;
        e.blinkT=(e.blinkT||0)+1;
        if (e.blinkT>130){ e.blinkT=0; const dist=player.x-e.x; e.x += Math.sign(dist)*Math.min(120,Math.abs(dist)*0.4); }
        e.y = e.baseY + Math.sin(e.t*1.8)*20;
        e.alpha = 0.55+Math.sin(e.t*3)*0.25;
        break;
      }
      case 'riftphantom': {
        e.pulseT=(e.pulseT||0)+1;
        e.pulsing = (e.pulseT%140)>110;
        break;
      }
      case 'bolt': case 'laser': {
        e.x += e.dir*5.5; e.life--; if (e.life<=0) e.alive=false;
        break;
      }
      case 'fireball': {
        e.x += e.dir*7; e.vy=(e.vy||0)+GRAVITY*0.3; e.y+=e.vy; e.life--;
        if (e.life<=0) e.alive=false;
        if (e.playerOwned){
          for (const other of level.entities.enemies){
            if (other===e || !other.alive || other.playerOwned) continue;
            if (Math.abs(other.x-e.x)<22 && Math.abs(other.y-e.y)<22){
              defeatEnemy(other,true); e.alive=false; break;
            }
          }
        }
        break;
      }
    }
    collideEnemyPlayer(e);
    if (e.x < camX-400) e.alive = (e.type==='eeltrap'||e.type==='crossbowman'||e.type==='turretDrone'||e.type==='riftphantom');
  }
  level.entities.enemies = level.entities.enemies.filter(e=> e.alive || e.deathTimer>0);
  for (const e of level.entities.enemies){ if(e.deathTimer>0) e.deathTimer--; }

  if (level.boss && level.boss.alive) updateBoss();
}

function groundAheadY(x,y){
  const tx = Math.floor((x+14)/TILE);
  const ty = Math.floor((y+40)/TILE);
  return solidTile(tileAt(tx,ty)) ? ty : null;
}
function snapToGround(x,y){
  const tx = Math.floor((x+14)/TILE);
  for (let ty=Math.floor(y/TILE); ty<level.height; ty++){
    if (solidTile(tileAt(tx,ty))) return ty*TILE-32;
  }
  return null;
}

const ALWAYS_HAZARD = new Set(['eeltrap','crossbowman','turretDrone','bolt','laser','anglerfin']);

function collideEnemyPlayer(e){
  if (!e.alive) return;
  const ex=e.x, ey=e.y, ew=28, eh= (e.type==='bolt'||e.type==='laser'||e.type==='fireball')?16:30;
  const pw=player.w, ph=player.power==='small'?24:34;
  const px=player.x, py=player.y+(player.h-ph);
  if (px<ex+ew && px+pw>ex && py<ey+eh && py+ph>ey){
    if (e.type==='fireball' && e.playerOwned) return;
    if (player.starTime>0){ defeatEnemy(e, true); return; }
    if (ALWAYS_HAZARD.has(e.type)){ hurtByEnemy(e); return; }
    if (e.type==='riftphantom'){ if (e.pulsing) hurtByEnemy(e); return; }
    if (e.type==='battlerook' && !e.stunned){
      if (player.vy>0 && py+ph-ey<18){ defeatEnemy(e,false); player.vy=-8.5; player.score+=200; }
      else { player.vx = -player.vx*0.4; }
      return;
    }
    if (player.vy>0 && py+ph-ey<18){
      defeatEnemy(e,false);
      player.vy = -8.5;
      player.score+=200;
    } else {
      hurtByEnemy(e);
    }
  }
}
function defeatEnemy(e, byFire){
  e.alive=false; e.deathTimer=20; e.dead=true;
  floatingTexts.push({x:e.x,y:e.y,text:'+200',life:40,vy:-1});
  playSfx('stomp');
}
function hurtByEnemy(e){
  if (player.shieldHits>0){ player.shieldHits--; player.invincible=60; if(player.shieldHits<=0) player.power='small'; return; }
  killPlayer();
}

function updateBoss(){
  const b = level.boss;
  b.t = (b.t||0)+1/60;
  b.hitCooldown = Math.max(0,(b.hitCooldown||0)-1);
  b.attackT = (b.attackT||0)+1;
  b.stunT = Math.max(0,(b.stunT||0)-1);

  const hpRatio = b.hp/b.maxHp;
  b.phase = hpRatio>0.66?1:hpRatio>0.33?2:3;

  if (b.stunT>0){
    b.y = (level.groundY-4)*TILE + Math.sin(b.t*6)*4;
  } else {
    const speed = 0.5+b.phase*0.35;
    b.x += Math.sin(b.t*0.8)*speed;
    b.x = Math.max(b.arenaLeft, Math.min(b.arenaRight-64, b.x));
    b.y = (level.groundY-4)*TILE + Math.sin(b.t*1.3)*22;

    const cadence = b.phase===1?150:b.phase===2?110:80;
    if (b.attackT>cadence){
      b.attackT=0;
      const roll = Math.random();
      if (b.phase>=2 && roll<0.4){
        for (let i=0;i<(b.phase===3?3:2);i++){
          setTimeout(()=>{
            if (!b.alive) return;
            level.entities.enemies.push({type:'bolt', x:b.x+20, y:b.y+30, dir: player.x<b.x?-1:1, alive:true, life:200});
          }, i*180);
        }
        playSfx('bossRoar');
      } else if (roll<0.7){
        b.vyBoss=-13; b.jumping=true;
      } else {
        b.dashT=30; b.dashDir = player.x<b.x?-1:1;
      }
    }
  }
  if (b.jumping){
    b.vyBoss=(b.vyBoss||0)+GRAVITY*0.7; b.y+=b.vyBoss;
    const floorY=(level.groundY-4)*TILE;
    if (b.y>=floorY){ b.y=floorY; b.jumping=false; b.vyBoss=0; }
  }
  if (b.dashT>0){
    b.x += b.dashDir*6; b.dashT--;
    b.x = Math.max(b.arenaLeft, Math.min(b.arenaRight-64, b.x));
  }

  const pw=player.w, ph=player.power==='small'?24:34;
  const px=player.x, py=player.y+(player.h-ph);
  const bw=64,bh=64;
  if (px<b.x+bw && px+pw>b.x && py<b.y+bh && py+ph>b.y){
    if (player.starTime>0 && b.hitCooldown===0){ damageBoss(b); }
    else if (player.vy>0 && py+ph-b.y<20 && b.hitCooldown===0){ damageBoss(b); player.vy=-9; }
    else if (b.hitCooldown===0) { hurtByEnemy({}); }
  }
}
function damageBoss(b){
  b.hp--; b.hitCooldown=45; b.stunT=25; playSfx('bossHit');
  floatingTexts.push({x:b.x+20,y:b.y-10,text:'-1',life:30,vy:-1.5});
  if (b.hp<=0){
    b.alive=false;
    floatingTexts.push({x:b.x,y:b.y,text:'GUARDIAN DEFEATED!',life:90,vy:-0.5});
    playSfx('bossDefeat');
    for(let i=0;i<10;i++) particles.push({type:'brick', x:b.x+30,y:b.y+20, vx:(Math.random()-0.5)*10, vy:-4-Math.random()*8, life:50});
  }
}

// ---------- Shards / Powerups ----------
function updatePickups(){
  const pw=player.w, ph=player.power==='small'?24:34;
  const px=player.x, py=player.y+(player.h-ph);
  const magnetOn = player.magnetTime>0;
  for (const c of level.entities.shards){
    if (c.collected) continue;
    if (magnetOn){
      const dx=(px+pw/2)-(c.x+8), dy=(py+ph/2)-(c.y+8);
      const dist=Math.hypot(dx,dy);
      if (dist<220 && dist>1){ c.x+=(dx/dist)*7; c.y+=(dy/dist)*7; }
    }
    if (px<c.x+18 && px+pw>c.x-2 && py<c.y+18 && py+ph>c.y-2){
      c.collected=true; player.shards++; player.score+=50; playSfx('shard');
    }
  }
  for (const p of level.entities.powerups){
    if (p.collected) continue;
    if (p.rising>0){ p.y-=1; p.rising--; continue; }
    if (p.vx){ p.x+=p.vx; const fy=snapToGround(p.x,p.y); if(fy!=null){p.vy=(p.vy||0)+GRAVITY*0.8; p.y+=p.vy; if(p.y>=fy){p.y=fy;p.vy=0;}} }
    if (px<p.x+22 && px+pw>p.x-2 && py<p.y+22 && py+ph>p.y-2){
      p.collected=true; applyPowerup(p.type); playSfx('powerup');
    }
  }
}
function applyPowerup(type){
  player.score+=500;
  floatingTexts.push({x:player.x,y:player.y-20,text: type.toUpperCase(), life:50, vy:-1});
  if (type==='overcharge'){ if(player.power==='small') player.power='overcharge'; }
  else if (type==='embercore'){ player.power='embercore'; }
  else if (type==='skywisp'){ player.power='skywisp'; }
  else if (type==='aegis'){ player.power='aegis'; player.shieldHits=1; }
  else if (type==='chronostar'){ player._prevPower=player.power==='chronostar'?player._prevPower:player.power; player.power='chronostar'; player.starTime=600; }
  else if (type==='lodestone'){ player.magnetTime=480; }
  else if (type==='surgeboots'){ player.power='surgeboots'; player.rocketTime=180; }
  else if (type==='stasis'){ freezeAllEnemies(360); }
  updatePowerIcon();
}
function freezeAllEnemies(frames){
  for (const e of level.entities.enemies){ if (e.alive) e.frozenT=frames; }
}

// ---------- Rendering ----------
function draw(){
  const th = level.theme;
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, th.sky1); g.addColorStop(1, th.sky2);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.fillStyle = th.hills;
  const hillOff = -(camX*0.25)%400;
  for (let i=-1;i<4;i++){
    const bx = hillOff+i*400;
    ctx.beginPath();
    ctx.ellipse(bx+200,H-40,260,120,0,Math.PI,0);
    ctx.fill();
  }
  if (th.cloud){
    ctx.fillStyle='rgba(255,255,255,0.75)';
    const cloudOff = -(camX*0.4)%500;
    for (let i=-1;i<4;i++){
      const cx=cloudOff+i*500+60, cy=70+((i*53)%40);
      drawCloud(cx,cy);
    }
  }
  ctx.fillStyle = shade(th.hills,-18);
  const midOff = -(camX*0.55)%300;
  for (let i=-1;i<5;i++){
    const bx = midOff+i*300;
    ctx.beginPath();
    ctx.ellipse(bx+150,H-10,150,70,0,Math.PI,0);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(-camX,0);

  const x0 = Math.floor(camX/TILE)-1, x1=Math.ceil((camX+W)/TILE)+1;
  for (let ty=0; ty<level.height; ty++){
    for (let tx=Math.max(0,x0); tx<Math.min(level.width,x1); tx++){
      const v = level.tiles[ty][tx];
      if (v) drawTile(tx,ty,v,th);
    }
  }

  if (level.isBoss) drawArenaDecor(level.arena, th);
  if (!level.isBoss) drawGoal(level.goal.x, level.goal.y);
  if (level.isBoss && level.boss && level.boss.alive) drawBoss(level.boss);
  if (level.isBoss && !level.boss.alive) drawGoal(level.goal.x, level.goal.y);

  for (const c of level.entities.shards) if(!c.collected) drawShard(c.x,c.y);
  for (const p of level.entities.powerups) if(!p.collected) drawPowerup(p);
  for (const e of level.entities.enemies) if (e.alive || e.deathTimer>0) drawEnemy(e);

  for (const p of particles) drawParticle(p);
  for (const f of floatingTexts) drawFloatText(f);

  drawPlayer();

  ctx.restore();
}

function shade(hex, amt){
  const c = hex.replace('#','');
  const num = parseInt(c,16);
  let r=(num>>16)+amt, g2=((num>>8)&0xff)+amt, b=(num&0xff)+amt;
  r=Math.max(0,Math.min(255,r)); g2=Math.max(0,Math.min(255,g2)); b=Math.max(0,Math.min(255,b));
  return `rgb(${r},${g2},${b})`;
}

function drawCloud(x,y){
  ctx.beginPath();
  ctx.ellipse(x,y,34,18,0,0,Math.PI*2);
  ctx.ellipse(x+28,y+6,26,15,0,0,Math.PI*2);
  ctx.ellipse(x-26,y+8,22,13,0,0,Math.PI*2);
  ctx.fill();
}

function drawTile(tx,ty,v,th){
  const x=tx*TILE, y=ty*TILE;
  ctx.save();
  if (v===1||v===9){
    const grd = ctx.createLinearGradient(x,y,x,y+TILE);
    grd.addColorStop(0, th.groundTop); grd.addColorStop(1, shade(th.ground,-10));
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fillRect(x,y+TILE-6,TILE,6);
    ctx.strokeStyle='rgba(0,0,0,0.12)'; ctx.strokeRect(x+0.5,y+0.5,TILE-1,TILE-1);
  } else if (v===2){
    ctx.fillStyle = shade(th.accent,10);
    ctx.fillRect(x,y,TILE,TILE);
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=2;
    ctx.strokeRect(x+2,y+2,TILE-4,TILE/2-3);
    ctx.strokeRect(x+2,y+TILE/2+1,TILE-4,TILE/2-3);
    ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fillRect(x,y,TILE,4);
  } else if (v===3||v===4){
    const grd=ctx.createLinearGradient(x,y,x,y+TILE);
    grd.addColorStop(0,'#ffd23d'); grd.addColorStop(1,'#e8960a');
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,TILE);
    ctx.strokeStyle='rgba(120,70,0,0.6)'; ctx.lineWidth=2; ctx.strokeRect(x+1.5,y+1.5,TILE-3,TILE-3);
    ctx.fillStyle='#7a4a00'; ctx.font='bold 18px Arial';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(v===4?'★':'?', x+TILE/2, y+TILE/2+1);
  } else if (v===5){
    const grd=ctx.createLinearGradient(x,y,x+TILE,y);
    grd.addColorStop(0,shade(th.accent,-20)); grd.addColorStop(0.5,shade(th.accent,20)); grd.addColorStop(1,shade(th.accent,-20));
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,TILE);
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.strokeRect(x+1,y+1,TILE-2,TILE-2);
  } else if (v===7){
    const grd=ctx.createLinearGradient(x,y,x,y+14);
    grd.addColorStop(0,'#fff'); grd.addColorStop(1,'#c9d8e0');
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,14);
    ctx.fillStyle='rgba(120,140,150,0.4)'; ctx.fillRect(x,y+14,TILE,4);
  }
  ctx.restore();
}

function drawGoal(x,y){
  ctx.save();
  ctx.fillStyle='#ccc'; ctx.fillRect(x+14,y,6,level.groundY*TILE-y);
  ctx.fillStyle='#3affea';
  ctx.beginPath();
  ctx.moveTo(x+20,y+6); ctx.lineTo(x+58,y+18); ctx.lineTo(x+20,y+30);
  ctx.fill();
  ctx.restore();
}

function drawArenaDecor(arena, theme){
  if (!arena) return;
  const flick = Math.sin(performance.now()/120)*0.3+0.7;
  ctx.save();
  ctx.globalAlpha = flick;
  ctx.fillStyle = theme.accent;
  [arena.startX+2, arena.width-2].forEach(px=>{
    const x=px*TILE, y=(level.groundY-6)*TILE;
    ctx.beginPath(); ctx.ellipse(x+16,y-6,10,16,0,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.08)';
  ctx.fillRect(arena.startX*TILE, 0, 4, level.groundY*TILE);
}

function drawBoss(b){
  const idx = b.guardianIdx;
  const flashHit = b.hitCooldown>30;
  ctx.save();
  ctx.translate(b.x,b.y);

  const auraColors = ['#3a8a1a','#8a7a3a','#3affea','#2adfff','#ff3ad0'];
  const phaseColor = shade(auraColors[idx], b.phase===1?0:b.phase===2?-20:-40);

  ctx.save();
  ctx.globalAlpha = 0.28+b.phase*0.1;
  ctx.fillStyle = phaseColor;
  ctx.beginPath(); ctx.ellipse(32,44,52,48,0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = flashHit?'#fff':phaseColor;

  if (idx===0){
    ctx.beginPath(); ctx.ellipse(32,40,36,32,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.moveTo(10,50); ctx.lineTo(-4,60); ctx.lineTo(8,58); ctx.fill();
    ctx.beginPath(); ctx.moveTo(54,50); ctx.lineTo(68,60); ctx.lineTo(56,58); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(20,30,6,0,Math.PI*2); ctx.arc(44,30,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#c00'; ctx.beginPath(); ctx.arc(20,30,2.5,0,Math.PI*2); ctx.arc(44,30,2.5,0,Math.PI*2); ctx.fill();
  } else if (idx===1){
    ctx.fillRect(6,10,52,54);
    ctx.fillStyle=shade(phaseColor,30); ctx.fillRect(16,0,32,18);
    ctx.fillStyle='#222'; ctx.fillRect(22,4,20,6);
    ctx.fillStyle='#ffd23d'; ctx.fillRect(6,44,52,6);
  } else if (idx===2){
    roundRectPath(-4,4,72,60,10); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(32,34,14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=flashHit?phaseColor:'#3affea'; ctx.beginPath(); ctx.arc(32,34,7,0,Math.PI*2); ctx.fill();
    const spin=performance.now()/300;
    ctx.strokeStyle='rgba(58,255,234,0.6)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-4,4); ctx.lineTo(-4+Math.cos(spin)*10,4+Math.sin(spin)*10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(68,4); ctx.lineTo(68+Math.cos(spin)*10,4+Math.sin(spin)*10); ctx.stroke();
  } else if (idx===3){
    ctx.beginPath(); ctx.ellipse(32,40,38,30,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    for(let i=0;i<6;i++){ ctx.beginPath(); ctx.moveTo(4+i*10,20); ctx.lineTo(9+i*10,32); ctx.lineTo(14+i*10,20); ctx.fill(); }
    ctx.fillStyle='#ffe95a'; ctx.beginPath(); ctx.arc(50,18,4,0,Math.PI*2); ctx.fill();
  } else {
    const spin=performance.now()/500;
    ctx.fillStyle=shade(phaseColor,20);
    const shardCount=4+b.phase*2;
    for (let i=0;i<shardCount;i++){
      const ang=spin+i*(Math.PI*2/shardCount);
      const sx=32+Math.cos(ang)*38, sy=40+Math.sin(ang)*36;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+Math.cos(ang)*10,sy+Math.sin(ang)*10); ctx.lineTo(sx+Math.cos(ang+1.5)*5,sy+Math.sin(ang+1.5)*5); ctx.fill();
    }
    ctx.fillStyle = flashHit?'#fff':phaseColor;
    ctx.beginPath();
    for(let i=0;i<10;i++){
      const ang=Math.PI/5*i-Math.PI/2;
      const rad=i%2===0?34:18;
      const sx=32+Math.cos(ang)*rad, sy=40+Math.sin(ang)*rad;
      if(i===0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(32,38,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=b.phase===3?'#ff3aff':'#1a0a2a'; ctx.beginPath(); ctx.arc(32,38,5,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(b.x-14,b.y-32,112,16);
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(b.x-14,b.y-32,112,16);
  const barColor = b.phase===1?'#4caf50':b.phase===2?'#ff9800':'#f44336';
  ctx.fillStyle=barColor; ctx.fillRect(b.x-11,b.y-29,Math.max(0,106*(b.hp/b.maxHp)),10);
  ctx.fillStyle='#fff'; ctx.font='bold 9px Arial'; ctx.textAlign='center';
  ctx.fillText(b.name.toUpperCase(), b.x+42, b.y-44);
  ctx.fillText(`PHASE ${b.phase}`, b.x+42, b.y-6);
}

function drawShard(x,y){
  const t = performance.now()/150;
  const sw = Math.abs(Math.sin(t))*12+4;
  ctx.save();
  ctx.translate(x+8,y+8);
  ctx.rotate(Math.PI/4);
  const grd = ctx.createLinearGradient(-sw/2,0,sw/2,0);
  grd.addColorStop(0,'#0aa0c0'); grd.addColorStop(0.5,'#7ef5ff'); grd.addColorStop(1,'#0aa0c0');
  ctx.fillStyle=grd;
  ctx.fillRect(-sw/2,-sw/2,sw,sw);
  ctx.restore();
}

function drawPowerup(p){
  ctx.save();
  ctx.translate(p.x,p.y);
  const bob = Math.sin(performance.now()/200)*3;
  if (p.type==='overcharge'){
    ctx.fillStyle='#ffe95a';
    ctx.beginPath(); ctx.moveTo(14,0+bob); ctx.lineTo(4,14+bob); ctx.lineTo(11,14+bob); ctx.lineTo(6,24+bob); ctx.lineTo(20,10+bob); ctx.lineTo(13,10+bob); ctx.closePath(); ctx.fill();
  } else if (p.type==='embercore'){
    ctx.fillStyle='#ff7a1a';
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.arc(11+Math.cos(i*1.26)*8,10+bob+Math.sin(i*1.26)*8,6,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#ffd23d'; ctx.beginPath(); ctx.arc(11,10+bob,6,0,Math.PI*2); ctx.fill();
  } else if (p.type==='chronostar'){
    drawStarShape(11,10+bob,11,'#ffd23d');
  } else if (p.type==='skywisp'){
    ctx.fillStyle='#8ad8ff';
    ctx.beginPath(); ctx.ellipse(11,10+bob,6,12,0.5,0,Math.PI*2); ctx.fill();
  } else if (p.type==='aegis'){
    ctx.fillStyle='#4ac9ff';
    ctx.beginPath(); ctx.moveTo(11,0+bob); ctx.lineTo(22,6+bob); ctx.lineTo(20,18+bob); ctx.lineTo(11,24+bob); ctx.lineTo(2,18+bob); ctx.lineTo(0,6+bob); ctx.closePath(); ctx.fill();
  } else if (p.type==='lodestone'){
    ctx.strokeStyle='#c9342a'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(11,12+bob,9,Math.PI*0.15,Math.PI*0.85); ctx.stroke();
    ctx.fillStyle='#c9342a'; ctx.fillRect(1,12+bob,5,8); ctx.fillRect(16,12+bob,5,8);
    ctx.fillStyle='#e8e8e8'; ctx.fillRect(1,18+bob,5,3); ctx.fillRect(16,18+bob,5,3);
  } else if (p.type==='surgeboots'){
    ctx.fillStyle='#d0d8e0';
    ctx.beginPath(); ctx.moveTo(11,-2+bob); ctx.lineTo(18,14+bob); ctx.lineTo(4,14+bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ff7a1a';
    ctx.beginPath(); ctx.moveTo(6,14+bob); ctx.lineTo(11,24+bob); ctx.lineTo(16,14+bob); ctx.fill();
  } else if (p.type==='stasis'){
    ctx.strokeStyle='#8adcff'; ctx.lineWidth=3; ctx.lineCap='round';
    for(let i=0;i<3;i++){
      const ang=i*Math.PI/3;
      ctx.save(); ctx.translate(11,12+bob); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0);
      ctx.moveTo(-6,-4); ctx.lineTo(-10,0); ctx.lineTo(-6,4);
      ctx.moveTo(6,-4); ctx.lineTo(10,0); ctx.lineTo(6,4);
      ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}
function drawStarShape(cx,cy,r,color){
  ctx.fillStyle=color;
  ctx.beginPath();
  for(let i=0;i<10;i++){
    const ang=Math.PI/5*i-Math.PI/2;
    const rad=i%2===0?r:r*0.45;
    const x=cx+Math.cos(ang)*rad, y=cy+Math.sin(ang)*rad;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill();
}

function drawEnemy(e){
  ctx.save();
  ctx.globalAlpha = e.alpha!==undefined?e.alpha:1;
  if (e.dead) ctx.globalAlpha *= (e.deathTimer/20);
  const squish = e.dead?0.2:1;
  ctx.translate(e.x+14, e.y+(e.dead?26:14));
  ctx.scale(1,squish);
  switch(e.type){
    case 'raptorling':
      ctx.fillStyle='#5a8a2a'; ctx.beginPath(); ctx.ellipse(0,0,14,11,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3a6a1a'; ctx.beginPath(); ctx.moveTo(10,-4); ctx.lineTo(20,-10); ctx.lineTo(12,2); ctx.fill();
      ctx.fillStyle='#ffe95a'; ctx.beginPath(); ctx.arc(6,-2,3,0,Math.PI*2); ctx.fill();
      break;
    case 'tuskcharger':
      ctx.fillStyle= e.charging?'#c9542a':'#8a5a3a'; ctx.beginPath(); ctx.ellipse(0,0,16,13,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(12,4); ctx.lineTo(22,2); ctx.lineTo(13,10); ctx.fill();
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(6,-4,2.5,0,Math.PI*2); ctx.fill();
      break;
    case 'direwasp':
      ctx.fillStyle='#ffcc22'; ctx.beginPath(); ctx.ellipse(0,0,11,8,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#222'; ctx.fillRect(-11,-3,22,2); ctx.fillRect(-11,2,22,2);
      ctx.fillStyle='rgba(255,255,255,0.6)';
      const wf=Math.sin(performance.now()/60)*8;
      ctx.beginPath(); ctx.ellipse(-2,-10+wf,8,4,0.2,0,Math.PI*2); ctx.fill();
      break;
    case 'pikeman':
      ctx.fillStyle='#7a7a8a'; ctx.fillRect(-8,-6,16,24);
      ctx.fillStyle='#c9c9d9'; ctx.beginPath(); ctx.arc(0,-10,7,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#888'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(10,-14); ctx.lineTo(28,-20); ctx.stroke();
      break;
    case 'battlerook':
      ctx.fillStyle='#5a5a6a'; ctx.fillRect(-13,-8,26,30);
      ctx.fillStyle='#3a3a4a'; ctx.fillRect(-13,-8,26,8);
      ctx.fillStyle='#ffd23d'; ctx.beginPath(); ctx.arc(0,-2,4,0,Math.PI*2); ctx.fill();
      break;
    case 'crossbowman':
      ctx.fillStyle='#6a5a3a'; ctx.fillRect(-9,-6,18,24);
      ctx.fillStyle='#c9c9d9'; ctx.beginPath(); ctx.arc(0,-10,6,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(14,0); ctx.stroke();
      break;
    case 'netbot':
      ctx.fillStyle='#3a4a6a'; roundRectPath(-14,-8,28,14,4); ctx.fill();
      ctx.fillStyle='#3affea'; ctx.beginPath(); ctx.arc(0,-1,5,0,Math.PI*2); ctx.fill();
      break;
    case 'glitchhound':
      ctx.fillStyle='#5a1a8a'; ctx.beginPath(); ctx.ellipse(0,0,13,10,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,80,255,0.5)'; ctx.beginPath(); ctx.ellipse(-4,0,13,10,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff3ad0'; ctx.beginPath(); ctx.arc(4,-3,2.5,0,Math.PI*2); ctx.fill();
      break;
    case 'turretDrone':
      ctx.fillStyle='#2a2a3a'; ctx.fillRect(-14,-4,28,26);
      ctx.fillStyle='#3affea'; ctx.beginPath(); ctx.arc(0,-4,5,0,Math.PI*2); ctx.fill();
      break;
    case 'anglerfin':
      ctx.fillStyle='#1a5a7a'; ctx.beginPath(); ctx.ellipse(0,0,14,10,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#2adfff'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(10,-8); ctx.lineTo(20,-20); ctx.stroke();
      ctx.fillStyle='#ffe95a'; ctx.beginPath(); ctx.arc(20,-20,3,0,Math.PI*2); ctx.fill();
      break;
    case 'eeltrap':
      ctx.fillStyle='#2a8a6a'; ctx.fillRect(-4,10,8,22);
      ctx.beginPath(); ctx.ellipse(0,0,10,13,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo(-8+i*5,-6); ctx.lineTo(-6+i*5,0); ctx.lineTo(-4+i*5,-6); ctx.fill(); }
      break;
    case 'jellydrifter':
      ctx.fillStyle='rgba(180,120,255,0.7)'; ctx.beginPath(); ctx.arc(0,-2,12,Math.PI,0); ctx.fill();
      ctx.strokeStyle='rgba(180,120,255,0.5)'; ctx.lineWidth=2;
      for(let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(-8+i*8,2); ctx.lineTo(-8+i*8,16); ctx.stroke(); }
      break;
    case 'voidmite':
      ctx.fillStyle='#6adcff'; ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(11,0); ctx.lineTo(0,12); ctx.lineTo(-11,0); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#1a3a5a'; ctx.beginPath(); ctx.arc(-3,-2,2,0,Math.PI*2); ctx.arc(3,-2,2,0,Math.PI*2); ctx.fill();
      break;
    case 'starlancer': {
      ctx.fillStyle='rgba(192,42,255,0.75)';
      ctx.beginPath();
      for(let i=0;i<8;i++){ const ang=i/8*Math.PI*2; const rad=i%2===0?13:7; const x=Math.cos(ang)*rad,y=Math.sin(ang)*rad; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'riftphantom':
      ctx.fillStyle='#8a2aff'; ctx.fillRect(-10,-4,20,20);
      ctx.fillStyle='#c02aff'; ctx.beginPath(); ctx.arc(0,-4,6,0,Math.PI*2); ctx.fill();
      if (e.pulsing){ ctx.strokeStyle='rgba(192,42,255,0.6)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,-4,20,0,Math.PI*2); ctx.stroke(); }
      break;
    case 'bolt':
      ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
      ctx.fillStyle='#888'; ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(4,-3); ctx.lineTo(4,3); ctx.fill();
      break;
    case 'laser':
      ctx.strokeStyle='#3affea'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(-12,0); ctx.lineTo(12,0); ctx.stroke();
      break;
    case 'fireball':
      ctx.fillStyle='#ff7a1a'; ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ffd23d'; ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill();
      break;
  }
  if (e.frozenT>0){
    ctx.fillStyle='rgba(160,220,255,0.55)';
    ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,0,17,17,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function roundRectPath(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function drawParticle(p){
  if (p.type==='shardpop'){
    p.y+=p.vy; p.vy+=0.4; p.life--;
    ctx.fillStyle='#7ef5ff'; ctx.fillRect(p.x-4,p.y-8,8,16);
  } else if (p.type==='brick'){
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.5; p.life--;
    ctx.fillStyle='#a85a2a'; ctx.fillRect(p.x-5,p.y-5,10,10);
  }
}
function drawFloatText(f){
  f.y+=f.vy; f.life--;
  ctx.save();
  ctx.globalAlpha = Math.min(1,f.life/20);
  ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=3;
  ctx.font='bold 16px Arial'; ctx.textAlign='center';
  ctx.strokeText(f.text,f.x+14,f.y);
  ctx.fillText(f.text,f.x+14,f.y);
  ctx.restore();
}

function drawPlayer(){
  const ph = player.crouching?player.h*0.6:(player.power==='small'?player.h*0.72:player.h);
  const py = player.y+(player.h-ph);
  ctx.save();
  if (player.hurtTime>0 && Math.floor(player.hurtTime/4)%2===0) ctx.globalAlpha=0.3;
  if (player.invincible>0 && Math.floor(player.invincible/4)%2===0) ctx.globalAlpha=0.5;
  ctx.translate(player.x+player.w/2, py+ph/2);
  ctx.scale(player.facing,1);

  const colors = {
    small:{body:'#3a7ac9', cap:'#e8342a'},
    overcharge:{body:'#3a7ac9', cap:'#ffd23d'},
    embercore:{body:'#fff', cap:'#ff5a1a'},
    chronostar:{body:`hsl(${(performance.now()/5)%360},80%,60%)`, cap:`hsl(${(performance.now()/5+90)%360},80%,50%)`},
    skywisp:{body:'#3a7ac9', cap:'#8ad8ff'},
    aegis:{body:'#3a7ac9', cap:'#4ac9ff'},
    surgeboots:{body:'#3a7ac9', cap:'#ff7a1a'},
  };
  const c = colors[player.power]||colors.small;

  ctx.save(); ctx.globalAlpha*=0.35; ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(0, ph/2+4, player.w*0.5, 5, 0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  const grdBody = ctx.createLinearGradient(-player.w/2,0,player.w/2,0);
  grdBody.addColorStop(0, shade(c.body,-25)); grdBody.addColorStop(0.5, c.body); grdBody.addColorStop(1, shade(c.body,-25));
  ctx.fillStyle=grdBody;
  roundRect(-player.w/2,-ph/2+8,player.w,ph-8,6); ctx.fill();

  ctx.fillStyle=shade('#2a5a9a',0);
  roundRect(-player.w/2,-ph*0.05,player.w,ph*0.5,4); ctx.fill();

  ctx.fillStyle='#f5c89a';
  ctx.beginPath(); ctx.arc(2,-ph/2+6,player.w*0.32,0,Math.PI*2); ctx.fill();
  const grdCap = ctx.createLinearGradient(0,-ph/2-4,0,-ph/2+8);
  grdCap.addColorStop(0, shade(c.cap,20)); grdCap.addColorStop(1, shade(c.cap,-20));
  ctx.fillStyle=grdCap;
  ctx.beginPath(); ctx.arc(2,-ph/2+2,player.w*0.36,Math.PI,0); ctx.fill();
  ctx.fillRect(-player.w*0.3+2,-ph/2+2,player.w*0.62,4);

  if (player.power==='skywisp'){
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.ellipse(-player.w/2-4,0,10,6,0.3,0,Math.PI*2); ctx.fill();
  }
  if (player.power==='aegis' && player.shieldHits>0){
    ctx.strokeStyle='rgba(74,201,255,0.8)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,0,player.w*0.9,0,Math.PI*2); ctx.stroke();
  }
  if (player.power==='surgeboots'){
    ctx.strokeStyle='rgba(255,122,26,0.7)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-player.w/2-10,ph/2); ctx.lineTo(-player.w/2-2,ph/2-6); ctx.stroke();
  }
  ctx.restore();
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// ---------- Audio ----------
let actx;
let musicTimer = null;
let musicOn = true;
let sfxOn = true;
let sfxGainNode=null, musicGainNode=null;

function getActx(){
  if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
  if (actx.state==='suspended') actx.resume();
  return actx;
}
function tone(freq, start, dur, type='sine', vol=0.09, slideTo=null){
  const ac = getActx();
  const o = ac.createOscillator(); const g = ac.createGain();
  o.connect(g); g.connect(masterGain());
  o.type=type; o.frequency.setValueAtTime(freq, ac.currentTime+start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime+start+dur);
  g.gain.setValueAtTime(0.0001, ac.currentTime+start);
  g.gain.exponentialRampToValueAtTime(vol, ac.currentTime+start+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+start+dur);
  o.start(ac.currentTime+start); o.stop(ac.currentTime+start+dur+0.02);
}
function masterGain(){
  const ac=getActx();
  if(!sfxGainNode){ sfxGainNode=ac.createGain(); sfxGainNode.gain.value=sfxOn?1:0; sfxGainNode.connect(ac.destination); }
  return sfxGainNode;
}
function musicMaster(){
  const ac=getActx();
  if(!musicGainNode){ musicGainNode=ac.createGain(); musicGainNode.gain.value=musicOn?0.5:0; musicGainNode.connect(ac.destination); }
  return musicGainNode;
}
function playSfx(kind){
  if (!sfxOn) return;
  try{
    switch(kind){
      case 'jump': tone(392,0,0.10,'square',0.08,660); break;
      case 'shard': tone(1046,0,0.06,'square',0.09); tone(1568,0.05,0.1,'square',0.08); break;
      case 'stomp': tone(180,0,0.09,'triangle',0.11,90); break;
      case 'fireball': tone(300,0,0.08,'sawtooth',0.09,500); break;
      case 'powerup': [523,659,784,1047].forEach((f,i)=> tone(f,i*0.07,0.14,'square',0.09)); break;
      case 'hurt': tone(220,0,0.14,'sawtooth',0.1,110); break;
      case 'death': tone(392,0,0.16,'sawtooth',0.1,196); tone(261,0.16,0.16,'sawtooth',0.09,110); tone(174,0.32,0.3,'sawtooth',0.08,60); break;
      case 'win': [523,659,784,1047,1319].forEach((f,i)=> tone(f,i*0.11,0.22,'square',0.09)); break;
      case 'bossHit': tone(150,0,0.1,'square',0.12,70); tone(80,0.05,0.15,'sawtooth',0.1,40); break;
      case 'bossDefeat': [220,196,164,131,98].forEach((f,i)=> tone(f,i*0.16,0.3,'sawtooth',0.11)); break;
      case 'bossRoar': tone(80,0,0.4,'sawtooth',0.14,40); tone(60,0.1,0.5,'square',0.1,30); break;
      case 'pause': tone(440,0,0.05,'sine',0.06); tone(330,0.05,0.08,'sine',0.05); break;
      case 'select': tone(660,0,0.06,'square',0.07); break;
      default: tone(440,0,0.1,'sine',0.08);
    }
  }catch(e){}
}
const MUSIC_SCALES = [
  [293,329,369,440,493],
  [220,246,293,329,392],
  [277,311,370,415,554],
  [233,262,311,349,415],
  [196,233,277,311,370],
];
let musicStepIdx=0;
function startMusic(worldIdx){
  stopMusic();
  if (!musicOn) return;
  const scale = MUSIC_SCALES[worldIdx % MUSIC_SCALES.length];
  musicStepIdx=0;
  const stepDur=0.34;
  function schedule(){
    if (!musicOn) return;
    const ac = getActx();
    const root = scale[0]/2;
    const o1=ac.createOscillator(), g1=ac.createGain();
    o1.type='triangle'; o1.frequency.value=root;
    o1.connect(g1); g1.connect(musicMaster());
    g1.gain.setValueAtTime(0.0001, ac.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.22, ac.currentTime+0.02);
    g1.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+stepDur*0.9);
    o1.start(); o1.stop(ac.currentTime+stepDur);
    if (musicStepIdx%2===0){
      const note = scale[Math.floor(Math.sin(musicStepIdx*1.7)*2.4+2.4)%scale.length];
      const o2=ac.createOscillator(), g2=ac.createGain();
      o2.type='square'; o2.frequency.value=note;
      o2.connect(g2); g2.connect(musicMaster());
      g2.gain.setValueAtTime(0.0001, ac.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.09, ac.currentTime+0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+stepDur*0.7);
      o2.start(); o2.stop(ac.currentTime+stepDur*0.7);
    }
    musicStepIdx++;
    musicTimer = setTimeout(schedule, stepDur*1000);
  }
  schedule();
}
function stopMusic(){ if (musicTimer) clearTimeout(musicTimer); musicTimer=null; }
function toggleMusic(){ musicOn=!musicOn; if(musicGainNode) musicGainNode.gain.value=musicOn?0.5:0; if(musicOn && state==='playing') startMusic(level.worldNum-1); else stopMusic(); }
function toggleSfx(){ sfxOn=!sfxOn; if(sfxGainNode) sfxGainNode.gain.value=sfxOn?1:0; }

// ---------- Main loop ----------
function updateHUD(){
  document.getElementById('shardCount').textContent = `💎 x${player.shards}`;
  document.getElementById('timeLabel').textContent = `⏱ ${Math.max(0,Math.ceil(timeLeft))}`;
  updatePowerIcon();
}

let lastT = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(3, (now-lastT)/16.67);
  lastT = now;
  if (state==='playing'){
    timeLeft -= dt/60;
    if (timeLeft<=0){ timeLeft=0; killPlayer(); }
    updatePlayer();
    updateEnemies();
    updatePickups();
    particles = particles.filter(p=>p.life>0);
    floatingTexts = floatingTexts.filter(f=>f.life>0);
    updateHUD();
  }
  if (state==='playing' || state==='paused'){
    draw();
  }
}
requestAnimationFrame(loop);
showScreen('titleScreen');

// Re-fit the canvas resolution on rotation/resize so the player and world
// stay a comfortable size instead of getting stretched or squashed.
let resizeDebounce=null;
window.addEventListener('resize', () => {
  clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    const newSize = computeCanvasSize();
    if (newSize.w !== canvas.width || newSize.h !== canvas.height){
      canvas.width = newSize.w;
      canvas.height = newSize.h;
      W = canvas.width; H = canvas.height;
      if (state==='playing' || state==='paused') draw();
    }
  }, 150);
});
