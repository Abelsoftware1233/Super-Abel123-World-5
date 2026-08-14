// ============================================================
// NOVA RIFT: CHRONO SAGA — LEVEL SYSTEM
// 20 unique levels across 5 brand-new "Ages" (4 levels each).
// Entirely new roster: enemies, power-ups, and a unique
// Guardian boss archetype for every Age.
// ============================================================

const TILE = 32;

const AGES = [
  { name: "The Primal Wilds", sky1: "#1a3a1a", sky2: "#6a9a3a", ground: "#3a2a1a", groundTop: "#4a7a2a", accent: "#8a5a2a", cloud:true, hills:"#2a5a1a", particle:"leaf" },
  { name: "Iron Age Ramparts", sky1: "#3a3a4a", sky2: "#8a8a9a", ground: "#4a3a2a", groundTop: "#6a5a4a", accent: "#9a7a3a", cloud:true, hills:"#4a4a5a", particle:"spark" },
  { name: "Neon Metroplex", sky1: "#0a0a1a", sky2: "#1a0a3a", ground: "#1a1a2a", groundTop: "#2a3a5a", accent: "#3affea", cloud:false, hills:"#151530", particle:"data" },
  { name: "The Sunken Deep", sky1: "#02182a", sky2: "#0a4a6a", ground: "#0a2a3a", groundTop: "#1a5a6a", accent: "#2adfff", cloud:false, hills:"#062035", particle:"bubble" },
  { name: "Omega Horizon", sky1: "#05010a", sky2: "#2a0a3a", ground: "#1a0a25", groundTop: "#5a1a7a", accent: "#ff3ad0", cloud:false, hills:"#12081f", particle:"star" },
];

// Brand new enemy roster — nothing recycled from prior games
const ENEMY_TYPES = [
  "raptorling","tuskcharger","direwasp",   // Primal Wilds
  "pikeman","battlerook","crossbowman",     // Iron Age
  "netbot","glitchhound","turretDrone",     // Neon Metroplex
  "anglerfin","eeltrap","jellydrifter",     // Sunken Deep
  "voidmite","starlancer","riftphantom",    // Omega Horizon
];

function makeRNG(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff);
  };
}

// Each age has its own enemy pool so encounters feel distinct per world
const AGE_ENEMY_POOL = [
  ["raptorling","tuskcharger","direwasp"],
  ["pikeman","battlerook","crossbowman"],
  ["netbot","glitchhound","turretDrone"],
  ["anglerfin","eeltrap","jellydrifter"],
  ["voidmite","starlancer","riftphantom"],
];

// Guardian boss archetypes — one distinct fighting style per age
const GUARDIAN_NAMES = ["Kron the Tuskbreaker","Sir Maldric the Rampart King","MX-9 Overwatch Prime","The Abyssal Maw","Echo, Warden of the Rift"];

function buildLevel(index) {
  const ageIdx = Math.floor(index / 4);
  const stageInAge = index % 4;
  const age = AGES[ageIdx];
  const rng = makeRNG(index * 104729 + 401);
  const isBoss = stageInAge === 3;

  const ARENA_WIDTH = 46;
  const width = isBoss ? (190 + Math.floor(rng()*30) + ARENA_WIDTH) : 170 + Math.floor(rng()*40);
  const height = 18;
  const groundY = 14;
  const arenaStartX = isBoss ? width - ARENA_WIDTH : null;

  const tiles = Array.from({length:height}, () => new Array(width).fill(0));

  // base ground with gaps (pits); arena zone always solid
  let x = 0;
  while (x < width) {
    const inArena = isBoss && x >= arenaStartX - 4;
    const segLen = inArena ? (width-x) : 8 + Math.floor(rng()*14);
    for (let i=0;i<segLen && x<width;i++,x++){
      for (let y=groundY;y<height;y++) tiles[y][x] = isBoss?9:1;
    }
    if (!inArena && x < width - 20 && rng() < 0.55) {
      const pitLen = 2 + Math.floor(rng()*3);
      x += pitLen;
    }
  }
  for (let y=groundY;y<height;y++){ tiles[y][0]=1; tiles[y][1]=1; tiles[y][width-1]=1; tiles[y][width-2]=1; tiles[y][width-3]=1; }

  const entities = { enemies:[], shards:[], powerups:[], platforms:[], decor:[] };

  const decorEndX = isBoss ? arenaStartX - 6 : width - 8;
  for (let x2=6; x2<decorEndX; x2+=3+Math.floor(rng()*5)) {
    const roll = rng();
    const groundHere = findGroundY(tiles, x2, height);
    if (roll < 0.22 && groundHere > 4) {
      const py = groundHere - (3 + Math.floor(rng()*4));
      const rowLen = 1 + Math.floor(rng()*4);
      for (let k=0;k<rowLen;k++){
        if (x2+k>=width-2) break;
        const isQ = rng() < 0.35;
        tiles[py][x2+k] = isQ ? (rng()<0.25?4:3) : 2;
      }
    } else if (roll < 0.35 && groundHere > 6) {
      const steps = 2+Math.floor(rng()*3);
      for (let s=0;s<steps;s++){
        for (let yy=0; yy<=s; yy++){
          const py = groundHere-1-yy;
          const px = x2+s;
          if (px<width-2 && py>=2) tiles[py][px]=2;
        }
      }
    } else if (roll < 0.48) {
      // vertical structure (pillar/tower) to jump around instead of a pipe
      const ph = 2+Math.floor(rng()*3);
      for (let yy=0; yy<ph; yy++){
        const py = groundHere-1-yy;
        if (py>=2) tiles[py][x2] = 5;
      }
    } else if (roll < 0.62 && groundHere>5) {
      const py = groundHere - (4+Math.floor(rng()*4));
      const rowLen = 3+Math.floor(rng()*4);
      for (let k=0;k<rowLen;k++){
        if (x2+k<width-2) tiles[py][x2+k] = 7;
      }
    }
  }

  // enemy placement — era-specific pool, denser gauntlet for boss levels
  const enemyPool = AGE_ENEMY_POOL[ageIdx];
  const enemyZoneEnd = isBoss ? arenaStartX - 4 : width - 20;
  let ecount = isBoss ? 24 + Math.floor(rng()*8) : 14 + Math.floor(rng()*10);
  for (let i=0;i<ecount;i++){
    const ex = 10 + Math.floor(rng()*Math.max(10,enemyZoneEnd-10));
    const gY = findGroundY(tiles, ex, height);
    if (gY <= 2) continue;
    const type = enemyPool[Math.floor(rng()*enemyPool.length)];
    if (type==="direwasp" || type==="glitchhound" || type==="jellydrifter" || type==="starlancer") {
      entities.enemies.push({type, x:ex*TILE, y:(gY-4-Math.floor(rng()*3))*TILE, range:60+rng()*80});
    } else {
      entities.enemies.push({type, x:ex*TILE, y:(gY-1)*TILE});
    }
  }

  // Time Shards (this game's coin equivalent)
  let scount = 30 + Math.floor(rng()*30) + (isBoss?20:0);
  for (let i=0;i<scount;i++){
    const cx = 6 + Math.floor(rng()*(width-12));
    const gY = findGroundY(tiles, cx, height);
    const cy = gY - (2+Math.floor(rng()*6));
    if (cy>=2 && tiles[cy][cx]===0) entities.shards.push({x:cx*TILE+16, y:cy*TILE+16});
  }

  // Power-ups — new roster
  const powerPool = ["overcharge","embercore","chronostar","skywisp","aegis","lodestone","surgeboots","stasis"];
  let pcount = (isBoss ? 7 : 5) + Math.floor(rng()*3);
  for (let i=0;i<pcount;i++){
    const px = 15 + Math.floor(rng()*Math.max(20,(isBoss?enemyZoneEnd:width-30)));
    const gY = findGroundY(tiles, px, height);
    const py = gY - (2+Math.floor(rng()*3));
    if (py>=2) entities.powerups.push({x:px*TILE+16, y:py*TILE, type:powerPool[Math.floor(rng()*powerPool.length)]});
  }
  if (isBoss) {
    const preArenaX = arenaStartX - 3;
    const gY1 = findGroundY(tiles, preArenaX, height);
    entities.powerups.push({x:preArenaX*TILE, y:(gY1-3)*TILE, type:'aegis'});
    entities.powerups.push({x:(preArenaX-3)*TILE, y:(gY1-3)*TILE, type:'chronostar'});
  }

  let boss = null;
  let arena = null;
  if (isBoss) {
    arena = buildArena(tiles, age, arenaStartX, width, groundY, height, rng, entities, ageIdx);
    const bossX = (arenaStartX + Math.floor(ARENA_WIDTH*0.55)) * TILE;
    boss = {
      type: "guardian",
      guardianIdx: ageIdx,
      name: GUARDIAN_NAMES[ageIdx],
      x: bossX, y:(groundY-4)*TILE,
      hp: 12 + ageIdx*4,
      maxHp: 12 + ageIdx*4,
      phase: 1,
      arenaLeft: arenaStartX*TILE + TILE*2,
      arenaRight: (width-4)*TILE,
    };
  }

  const goal = { x:(width-4)*TILE, y:(groundY-8)*TILE };

  return {
    index, theme: age, width, height, tiles, groundY,
    entities, boss, goal, isBoss, arena, arenaStartX,
    name: `${age.name} ${stageInAge+1}-${isBoss?"GUARDIAN":stageInAge+1}`,
    worldNum: ageIdx+1, stageNum: stageInAge+1,
    timeLimit: isBoss ? 560 : 300 + Math.floor(rng()*60),
  };
}

function findGroundY(tiles, x, height) {
  for (let y=0;y<height;y++){
    if (tiles[y][x] && tiles[y][x]!==7) return y;
  }
  return height-1;
}

function buildArena(tiles, theme, startX, width, groundY, height, rng, entities, ageIdx) {
  const floorStart = Math.max(0, startX - 5);
  for (let ty=0; ty<groundY; ty++){
    for (let tx=startX; tx<width; tx++){
      tiles[ty][tx] = 0;
    }
  }
  for (let tx=floorStart; tx<width; tx++){
    for (let ty=groundY; ty<height; ty++){
      tiles[ty][tx] = 9;
    }
  }
  const platforms = [];
  for (let i=0;i<3;i++){
    const px = startX + 6 + i*13;
    const py = groundY - (4 + (i%2)*3);
    const len = 4;
    for (let k=0;k<len;k++){
      if (px+k < width-3) tiles[py][px+k] = 7;
    }
    platforms.push({x:px,y:py,len});
  }
  for (let i=0;i<2;i++){
    const px = startX + 2 + i*(width-startX-6);
    for (let py=groundY-6; py<groundY; py++){
      if (px>=0 && px<width) tiles[py][px] = 9;
    }
  }
  // age-specific extra hazard enemies in the arena
  const extraPool = AGE_ENEMY_POOL[ageIdx];
  entities.enemies.push({type:extraPool[1], x:(startX+10)*TILE, y:(groundY-6)*TILE, range:100});
  entities.enemies.push({type:extraPool[1], x:(startX+26)*TILE, y:(groundY-5)*TILE, range:120});

  for (let i=0;i<12;i++){
    const cx = startX+4+Math.floor(rng()*(width-startX-8));
    const cy = groundY-3-Math.floor(rng()*5);
    entities.shards.push({x:cx*TILE+16, y:cy*TILE+16});
  }
  return { startX, width, platforms };
}

const ALL_LEVELS_META = Array.from({length:20}, (_,i) => {
  const w = Math.floor(i/4)+1, s = (i%4)+1;
  return { index:i, world:w, stage:s, isBoss: s===4, theme: AGES[Math.floor(i/4)].name };
});
