import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EnemyBird } from '../entities/EnemyBird.js';

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const ONE_SCALE = new THREE.Vector3(1, 1, 1);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.size = 1500; // 1500x1500m vast colossal ancient forest
    this.resolution = 128;
    this.trees = [];
    this.branches = []; // 3D branch collision & perching registry
    this.trunks = []; // Vertical tapered trunk colliders (no flying through bark)
    this.rocks = [];
    this.updrafts = [];
    this.resources = [];
    this.enemies = [];
    this.floatingLeaves = null;
    this.glowingSpores = null;

    // Broad-phase spatial hashing (branch & trunk lookups stay cheap every frame)
    this.gridCellSize = 12;
    this.branchGrid = new Map();
    this.trunkGrid = new Map();
    this._segA = new THREE.Vector3();
    this._segB = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._mat4 = new THREE.Matrix4();
    this._segW = new THREE.Vector3();
    this._segV = new THREE.Vector3();

    // Reused query results (avoids per-frame garbage)
    this._perchResult = { height: 0, isBranch: false, branch: null, t: 0 };
    this._collisionResult = { hit: false, impactSpeed: 0, normal: new THREE.Vector3(0, 1, 0) };

    // Nest Base Structure State
    this.nestLevel = 1;
    this.nestMaxLevel = 4;
    this.nestGroup = null;
    this.nestSite = { position: new THREE.Vector3(54, 85.8, 45) };
    this.nestUpgradeRequirements = {
      2: { twigs: 3, berries: 2, feathers: 0, pebbles: 0, name: 'Moss & Bark Roost' },
      3: { twigs: 5, feathers: 3, pebbles: 3, berries: 2, name: 'Feathered Canopy Aerie' },
      4: { twigs: 8, feathers: 6, pebbles: 6, berries: 4, name: 'Sanctuary of the Ancient Aviary' }
    };

    // Forest Wind
    this.wind = new THREE.Vector3(1.8, -0.2, -1.0);

    this._generateTerrain();
    this._generateColossalForest();
    this._generateForestFloorDetails();
    this._generateSunbeams();
    this._generateThermalClearings();
    this._buildNestBaseStructure();
    this._buildCollisionGrids();
    this._generateForestCollectibles();
    this._generateForestParticles();
    this._spawnForestPredators();
  }

  // Multi-octave procedural terrain generator for forest valleys, hills, ridges, and river canyons
  _noise(x, z) {
    const s1 = Math.sin(x * 0.0025) * Math.cos(z * 0.0025) * 65;
    const s2 = Math.sin(x * 0.006 + 1.2) * Math.cos(z * 0.006 + 1.8) * 35;
    const s3 = Math.sin(x * 0.015 + 2.5) * Math.cos(z * 0.015 + 0.6) * 14;
    const s4 = Math.sin(x * 0.04) * Math.sin(z * 0.04) * 4.0;

    // North-Western Ancient Mountain Range
    const cliffDist = Math.hypot(x + 500, z + 450);
    const cliffHeight = Math.max(0, 160 - cliffDist * 0.25);

    // South-Eastern Highland Ridge
    const ridgeDist = Math.hypot(x - 650, z - 550);
    const ridgeHeight = Math.max(0, 130 - ridgeDist * 0.22);

    // Winding Forest River Canyon running through the central valley
    const riverX = Math.sin(z * 0.004) * 220;
    const distToRiver = Math.abs(x - riverX);
    let riverBed = 0;
    if (distToRiver < 85) {
      riverBed = -Math.cos((distToRiver / 85) * (Math.PI / 2)) * 24;
    }

    const rawHeight = s1 + s2 + s3 + s4 + cliffHeight + ridgeHeight + riverBed + 15;
    return Math.max(0.5, rawHeight);
  }

  getTerrainHeight(x, z) {
    return this._noise(x, z);
  }

  // Check branch perching surfaces and ground elevation below bird
  getPerchSurface(pos, radius = 0.9) {
    const groundY = this.getTerrainHeight(pos.x, pos.z);
    const bestPerch = this._perchResult;
    bestPerch.height = groundY;
    bestPerch.isBranch = false;
    bestPerch.branch = null;
    bestPerch.t = 0;

    // Only branches whose inflated bounds overlap this cell are stored in it
    const candidates = this._queryBranchCell(pos.x, pos.z);
    if (!candidates) return bestPerch;

    const v = this._segV;
    const w = this._segW;

    for (let i = 0; i < candidates.length; i++) {
      const b = candidates[i];
      if (b.perchable === false) continue;

      // Point-to-segment projection in 3D
      v.subVectors(b.p2, b.p1);
      w.subVectors(pos, b.p1);
      const c2 = v.dot(v);
      const t = c2 > 1e-6 ? THREE.MathUtils.clamp(w.dot(v) / c2, 0, 1) : 0;
      const projX = b.p1.x + v.x * t;
      const projY = b.p1.y + v.y * t;
      const projZ = b.p1.z + v.z * t;

      const distXZ = Math.hypot(pos.x - projX, pos.z - projZ);
      if (distXZ <= b.radius + radius + 0.3) {
        const branchTopY = projY + b.radius;
        // Perch only on branches level with or just below the bird
        if (pos.y >= branchTopY - 3.0 && branchTopY > bestPerch.height) {
          bestPerch.height = branchTopY;
          bestPerch.isBranch = true;
          bestPerch.branch = b;
          bestPerch.t = t;
        }
      }
    }

    return bestPerch;
  }

  // ================= BROAD-PHASE SPATIAL HASH =================
  _cellKey(cx, cz) {
    return cx + ',' + cz;
  }

  _registerBranch(p1, p2, radius, options = {}) {
    const branch = {
      p1,
      p2,
      radius,
      perchable: options.perchable !== false
    };
    this.branches.push(branch);
    if (this.branchGrid) this._indexBranch(branch);
    return branch;
  }

  _registerTrunk(trunk) {
    this.trunks.push(trunk);
    if (this.trunkGrid) this._indexTrunk(trunk);
    return trunk;
  }

  _indexBranch(branch) {
    const margin = branch.radius + 2.4;
    const minX = Math.floor((Math.min(branch.p1.x, branch.p2.x) - margin) / this.gridCellSize);
    const maxX = Math.floor((Math.max(branch.p1.x, branch.p2.x) + margin) / this.gridCellSize);
    const minZ = Math.floor((Math.min(branch.p1.z, branch.p2.z) - margin) / this.gridCellSize);
    const maxZ = Math.floor((Math.max(branch.p1.z, branch.p2.z) + margin) / this.gridCellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const key = this._cellKey(cx, cz);
        let cell = this.branchGrid.get(key);
        if (!cell) {
          cell = [];
          this.branchGrid.set(key, cell);
        }
        cell.push(branch);
      }
    }
  }

  _indexTrunk(trunk) {
    const maxR = Math.max(trunk.radiusBottom, trunk.radiusTop);
    const minX = Math.floor((trunk.x - maxR) / this.gridCellSize);
    const maxX = Math.floor((trunk.x + maxR) / this.gridCellSize);
    const minZ = Math.floor((trunk.z - maxR) / this.gridCellSize);
    const maxZ = Math.floor((trunk.z + maxR) / this.gridCellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const key = this._cellKey(cx, cz);
        let cell = this.trunkGrid.get(key);
        if (!cell) {
          cell = [];
          this.trunkGrid.set(key, cell);
        }
        cell.push(trunk);
      }
    }
  }

  _buildCollisionGrids() {
    this.branchGrid.clear();
    this.trunkGrid.clear();
    this.branches.forEach(b => this._indexBranch(b));
    this.trunks.forEach(t => this._indexTrunk(t));
  }

  _queryBranchCell(x, z) {
    return this.branchGrid.get(this._cellKey(Math.floor(x / this.gridCellSize), Math.floor(z / this.gridCellSize)));
  }

  _queryTrunkCell(x, z) {
    return this.trunkGrid.get(this._cellKey(Math.floor(x / this.gridCellSize), Math.floor(z / this.gridCellSize)));
  }

  _trunkRadiusAt(trunk, y) {
    const span = Math.max(0.001, trunk.topY - trunk.baseY);
    const f = THREE.MathUtils.clamp((y - trunk.baseY) / span, 0, 1);
    return trunk.radiusBottom + (trunk.radiusTop - trunk.radiusBottom) * f;
  }

  // Push a sphere out of solid trunks and branches so nothing phases through bark.
  resolveObstacleCollision(pos, velocity, radius) {
    const result = this._collisionResult;
    result.hit = false;
    result.impactSpeed = 0;
    result.normal.set(0, 1, 0);

    const v = this._segV;
    const w = this._segW;

    // 1. Tapered trunk cylinders (hollow "gate" trees stay fly-through)
    const trunks = this._queryTrunkCell(pos.x, pos.z);
    if (trunks) {
      for (let i = 0; i < trunks.length; i++) {
        const t = trunks[i];
        if (t.hollow) continue;
        if (pos.y < t.baseY - radius || pos.y > t.topY + radius) continue;

        const r = this._trunkRadiusAt(t, pos.y) + radius;
        let dx = pos.x - t.x;
        let dz = pos.z - t.z;
        let dist = Math.hypot(dx, dz);
        if (dist >= r) continue;

        if (dist < 1e-4) {
          dx = 1;
          dz = 0;
          dist = 1;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        pos.x = t.x + nx * r;
        pos.z = t.z + nz * r;

        const vn = velocity.x * nx + velocity.z * nz;
        if (vn < 0) {
          velocity.x -= nx * vn;
          velocity.z -= nz * vn;
          if (-vn > result.impactSpeed) {
            result.impactSpeed = -vn;
            result.normal.set(nx, 0, nz);
          }
        }
        result.hit = true;
      }
    }

    // 2. Branch, root and log capsules
    const branches = this._queryBranchCell(pos.x, pos.z);
    if (branches) {
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        v.subVectors(b.p2, b.p1);
        w.subVectors(pos, b.p1);
        const c2 = v.dot(v);
        const t = c2 > 1e-6 ? THREE.MathUtils.clamp(w.dot(v) / c2, 0, 1) : 0;
        const px = b.p1.x + v.x * t;
        const py = b.p1.y + v.y * t;
        const pz = b.p1.z + v.z * t;

        let dx = pos.x - px;
        let dy = pos.y - py;
        let dz = pos.z - pz;
        let dist = Math.hypot(dx, dy, dz);
        const r = b.radius + radius;
        if (dist >= r) continue;

        if (dist < 1e-4) {
          dy = 1;
          dist = 1;
        }
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        pos.x = px + nx * r;
        pos.y = py + ny * r;
        pos.z = pz + nz * r;

        const vn = velocity.x * nx + velocity.y * ny + velocity.z * nz;
        if (vn < 0) {
          velocity.x -= nx * vn;
          velocity.y -= ny * vn;
          velocity.z -= nz * vn;
          if (-vn > result.impactSpeed) {
            result.impactSpeed = -vn;
            result.normal.set(nx, ny, nz);
          }
        }
        result.hit = true;
      }
    }

    return result;
  }

  getWind(pos) {
    return this.wind;
  }

  getUpdraftAt(pos) {
    for (const u of this.updrafts) {
      const distXZ = Math.hypot(pos.x - u.position.x, pos.z - u.position.z);
      if (distXZ < u.radius && pos.y >= u.position.y && pos.y <= u.position.y + u.height) {
        const falloff = 1.0 - (distXZ / u.radius);
        return { active: true, strength: u.strength * falloff };
      }
    }
    return { active: false, strength: 0 };
  }

  _generateTerrain() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.resolution, this.resolution);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];

    // Rich enchanted forest vertex colors
    const colorDeepSoil = new THREE.Color(0x22140b);
    const colorMossyFloor = new THREE.Color(0x18421d);
    const colorLushGrass = new THREE.Color(0x286d2d);
    const colorClover = new THREE.Color(0x3ea132);
    const colorCliffRock = new THREE.Color(0x444137);
    const colorRiverCobble = new THREE.Color(0x2f3d32);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this._noise(x, z);
      pos.setY(i, y);

      const vertexColor = new THREE.Color();
      const riverX = Math.sin(z * 0.004) * 220;
      const distToRiver = Math.abs(x - riverX);

      if (distToRiver < 42 && y < 14) {
        vertexColor.copy(colorRiverCobble);
      } else if (y < 16) {
        vertexColor.lerpColors(colorDeepSoil, colorMossyFloor, Math.random() * 0.6 + 0.2);
      } else if (y < 65) {
        vertexColor.lerpColors(colorMossyFloor, colorLushGrass, (y - 16) / 49);
      } else if (y < 115) {
        vertexColor.lerpColors(colorLushGrass, colorClover, (y - 65) / 50);
      } else {
        vertexColor.lerpColors(colorClover, colorCliffRock, (y - 115) / 45);
      }
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true
    });

    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    // Forest River Stream Plane across the massive 3600m world
    const riverGeo = new THREE.PlaneGeometry(280, this.size, 16, 96);
    riverGeo.rotateX(-Math.PI / 2);
    const riverPos = riverGeo.attributes.position;
    for (let i = 0; i < riverPos.count; i++) {
      const z = riverPos.getZ(i);
      const rCenter = Math.sin(z * 0.004) * 220;
      riverPos.setX(i, riverPos.getX(i) * 0.35 + rCenter);
    }
    riverGeo.computeVertexNormals();

    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x195b52,
      transparent: true,
      opacity: 0.9,
      roughness: 0.1,
      metalness: 0.6
    });
    this.riverMesh = new THREE.Mesh(riverGeo, riverMat);
    this.riverMesh.position.y = 6.0;
    this.scene.add(this.riverMesh);
  }

  _generateColossalForest() {
    const barkRedwoodMat = new THREE.MeshStandardMaterial({
      color: 0x542813,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true
    });
    const barkMossyMat = new THREE.MeshStandardMaterial({
      color: 0x362c18,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true
    });
    const foliageEmeraldMat = new THREE.MeshStandardMaterial({
      color: 0x1a5722,
      roughness: 0.72,
      flatShading: true
    });
    const foliageDeepMat = new THREE.MeshStandardMaterial({
      color: 0x113d17,
      roughness: 0.78,
      flatShading: true
    });
    const foliageGoldenMat = new THREE.MeshStandardMaterial({
      color: 0x76a32d,
      roughness: 0.68,
      flatShading: true
    });
    const vineMat = new THREE.MeshStandardMaterial({
      color: 0x24471f,
      roughness: 0.85,
      flatShading: true
    });

    // 1. TITANIC GREAT ANCIENT TREES (Towering 220m to 320m tall with 16m - 26m wide trunks)
    const titanTrees = [
      { x: 30, z: 45, height: 280, trunkR: 18.0, name: 'The Ancestral Great Tree' },
      { x: -450, z: -320, height: 260, trunkR: 16.5, name: 'Elder Oak of Echoes' },
      { x: 650, z: -580, height: 295, trunkR: 19.0, name: 'Redwood Monarch King' },
      { x: -720, z: 680, height: 250, trunkR: 15.5, name: 'Whispering Willow Titan' },
      { x: 380, z: 850, height: 270, trunkR: 17.0, name: 'Gilded Sunspire Tree' },
      { x: -350, z: -950, height: 240, trunkR: 15.0, name: 'Mossy Giant Spire' },
      { x: 0, z: -420, height: 265, trunkR: 17.5, isHollow: true, name: 'The Hollow Gate Tree' },
      { x: 880, z: 360, height: 255, trunkR: 16.0, name: 'Amber Redwood Monarch' },
      { x: -1100, z: 450, height: 275, trunkR: 18.0, name: 'Emerald Cloud Spire' },
      { x: 950, z: -1100, height: 260, trunkR: 16.5, name: 'Thunder Grove Titan' },
      { x: -650, z: -1200, height: 250, trunkR: 15.5, name: 'High Aerie Elder Tree' },
      { x: 1200, z: 900, height: 280, trunkR: 18.5, name: 'Celestial Crown Giant' }
    ];

    titanTrees.forEach((cfg, idx) => {
      const terrainY = this.getTerrainHeight(cfg.x, cfg.z);
      this._buildColossalTree(cfg.x, terrainY, cfg.z, cfg.height, cfg.trunkR, true, cfg.isHollow, {
        barkMat: idx % 2 === 0 ? barkRedwoodMat : barkMossyMat,
        foliageMat1: foliageEmeraldMat,
        foliageMat2: foliageGoldenMat,
        foliageMat3: foliageDeepMat,
        vineMat: vineMat
      });
    });

    // 2. VAST CANOPY GIANTS (320+ massive trees distributed across the 3.6km forest)
    const treeCount = 320;
    for (let i = 0; i < treeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 55 + Math.random() * 1650;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const riverX = Math.sin(z * 0.004) * 220;
      if (Math.abs(x - riverX) < 32) continue;

      const terrainY = this.getTerrainHeight(x, z);
      if (terrainY > 3 && terrainY < 140) {
        const height = 110 + Math.random() * 130; // 110m to 240m tall!
        const trunkR = 5.0 + Math.random() * 6.5; // 5.0m to 11.5m radius trunk!
        const barkMat = Math.random() > 0.4 ? barkRedwoodMat : barkMossyMat;

        this._buildColossalTree(x, terrainY, z, height, trunkR, false, false, {
          barkMat,
          foliageMat1: foliageEmeraldMat,
          foliageMat2: foliageGoldenMat,
          foliageMat3: foliageDeepMat,
          vineMat: vineMat
        });
      }
    }
  }

  // Build a cylinder geometry spanning from -> to, pre-placed in tree local space
  _segmentGeometry(from, to, radiusFrom, radiusTo, radialSegments = 6) {
    const dir = this._segA.subVectors(to, from);
    const len = dir.length();
    if (len < 1e-4) return null;

    const geo = new THREE.CylinderGeometry(radiusTo, radiusFrom, len, radialSegments);
    this._quat.setFromUnitVectors(UP_AXIS, dir.divideScalar(len));
    this._segB.copy(from).addScaledVector(dir, 0.5);
    this._mat4.compose(this._segB, this._quat, ONE_SCALE);
    geo.applyMatrix4(this._mat4);
    return geo;
  }

  // Trees are merged per material so the whole forest stays cheap to draw
  _bucketAdd(bucket, material, geometry) {
    if (!geometry) return;
    let list = bucket.get(material);
    if (!list) {
      list = [];
      bucket.set(material, list);
    }
    list.push(geometry);
  }

  _flushBuckets(group, bucket, castShadow) {
    bucket.forEach((geos, material) => {
      let geometry = null;
      if (geos.length === 1) {
        geometry = geos[0];
      } else {
        try {
          geometry = mergeGeometries(geos, false);
        } catch (e) {
          geometry = null;
        }
      }

      if (!geometry) {
        // Fallback: keep the individual meshes if the merge is not possible
        geos.forEach(g => {
          const mesh = new THREE.Mesh(g, material);
          mesh.castShadow = castShadow;
          mesh.receiveShadow = true;
          group.add(mesh);
        });
        return;
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
  }

  // Build one tapered limb segment: merged geometry + matching world collider/perch entry
  _addBranchSegment(bucket, materials, worldOffset, from, to, radiusFrom, radiusTo) {
    const geo = this._segmentGeometry(from, to, radiusFrom, radiusTo);
    if (!geo) return;
    this._bucketAdd(bucket, materials.barkMat, geo);

    this._registerBranch(
      new THREE.Vector3(from.x + worldOffset.x, from.y + worldOffset.y, from.z + worldOffset.z),
      new THREE.Vector3(to.x + worldOffset.x, to.y + worldOffset.y, to.z + worldOffset.z),
      Math.max(radiusFrom, radiusTo) * 0.92
    );
  }

  // Construct a colossal tree: flared buttress roots, tapered trunk, arched limbs, crown canopy
  _buildColossalTree(x, y, z, height, trunkRadius, isTitan = false, isHollow = false, materials) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);

    const solidParts = new Map(); // shadow casting geometry
    const lightParts = new Map(); // thin geometry (vines)

    const worldOffset = new THREE.Vector3(x, y, z);
    const trunkBottomR = trunkRadius * 1.2;
    const trunkTopR = trunkRadius * 0.4;

    // 1. Flared Buttress Roots spreading out of the trunk base into the ground
    const rootCount = isTitan ? 7 : 5;
    for (let r = 0; r < rootCount; r++) {
      const rootAngle = (r / rootCount) * Math.PI * 2 + Math.random() * 0.4;
      const rootReach = trunkRadius * (1.9 + Math.random() * 1.4);
      const rootRise = trunkRadius * (0.5 + Math.random() * 0.55);
      const cosA = Math.cos(rootAngle);
      const sinA = Math.sin(rootAngle);

      const inner = new THREE.Vector3(cosA * trunkRadius * 0.8, rootRise, sinA * trunkRadius * 0.8);
      const outer = new THREE.Vector3(
        cosA * (trunkRadius * 0.8 + rootReach),
        0.15,
        sinA * (trunkRadius * 0.8 + rootReach)
      );

      this._bucketAdd(
        solidParts,
        materials.barkMat,
        this._segmentGeometry(inner, outer, trunkRadius * 0.6, trunkRadius * 0.14)
      );

      // Roots are solid and can be perched upon
      this._registerBranch(
        new THREE.Vector3(x + inner.x, y + inner.y, z + inner.z),
        new THREE.Vector3(x + outer.x, y + outer.y, z + outer.z),
        trunkRadius * 0.42
      );
    }

    // 2. Tapered Trunk
    if (isHollow) {
      // Hollow archway trunk: the bird can fly straight through it
      const hollowGeo = new THREE.CylinderGeometry(trunkTopR * 1.5, trunkBottomR * 0.92, height, 14, 1, true);
      hollowGeo.translate(0, height / 2, 0);
      this._bucketAdd(solidParts, materials.barkMat, hollowGeo);

      const rimGeo = new THREE.TorusGeometry(trunkTopR * 1.5, trunkRadius * 0.3, 6, 18);
      rimGeo.rotateX(Math.PI / 2);
      rimGeo.translate(0, height - 0.5, 0);
      this._bucketAdd(solidParts, materials.barkMat, rimGeo);
    } else {
      const trunkGeo = new THREE.CylinderGeometry(trunkTopR, trunkBottomR, height, 12);
      trunkGeo.translate(0, height / 2, 0);
      this._bucketAdd(solidParts, materials.barkMat, trunkGeo);
    }

    // Solid trunk volume for collision (hollow gate trees stay fly-through)
    this._registerTrunk({
      x,
      z,
      baseY: y,
      topY: y + height,
      radiusBottom: trunkBottomR * 0.95,
      radiusTop: trunkTopR * 1.05,
      hollow: !!isHollow
    });

    // 3. Arched Limbs in stacked height tiers
    const tiers = isTitan ? 5 : 4;
    const branchCountPerTier = isTitan ? 3 : 2;

    for (let t = 0; t < tiers; t++) {
      const tierNorm = (t + 1) / (tiers + 1);
      const tierHeight = height * (0.2 + tierNorm * 0.6);
      const tierTrunkR = trunkBottomR + (trunkTopR - trunkBottomR) * (tierHeight / height);

      for (let b = 0; b < branchCountPerTier; b++) {
        const branchAngle = (b / branchCountPerTier) * Math.PI * 2 + t * 1.4 + Math.random() * 0.4;
        const branchLength = trunkRadius * (4.0 + Math.random() * 4.5) * (1.15 - tierNorm * 0.3);
        const baseRadius = (trunkRadius * 0.33) * (1.05 - tierNorm * 0.3);
        const curve = (Math.random() > 0.5 ? 1 : -1) * (0.16 + Math.random() * 0.3);
        const rise = 0.14 + Math.random() * 0.14;

        const innerLen = branchLength * 0.55;
        const outerLen = branchLength * 0.45;

        const cosA = Math.cos(branchAngle);
        const sinA = Math.sin(branchAngle);
        const tipAngle = branchAngle + curve;
        const cosT = Math.cos(tipAngle);
        const sinT = Math.sin(tipAngle);

        // Start on the trunk surface, arc up, then bend and droop toward the tip
        const start = new THREE.Vector3(cosA * tierTrunkR * 0.9, tierHeight, sinA * tierTrunkR * 0.9);
        const elbow = new THREE.Vector3(
          start.x + cosA * innerLen,
          tierHeight + innerLen * rise,
          start.z + sinA * innerLen
        );
        const tip = new THREE.Vector3(
          elbow.x + cosT * outerLen,
          elbow.y + outerLen * (rise * 0.5 - 0.06),
          elbow.z + sinT * outerLen
        );

        this._addBranchSegment(solidParts, materials, worldOffset, start, elbow, baseRadius, baseRadius * 0.62);
        this._addBranchSegment(solidParts, materials, worldOffset, elbow, tip, baseRadius * 0.62, baseRadius * 0.26);

        // Secondary fork limb splitting off the elbow
        if (Math.random() > 0.45) {
          const forkAngle = tipAngle + (Math.random() > 0.5 ? 0.55 : -0.55);
          const forkLen = branchLength * 0.42;
          const forkR = baseRadius * 0.5;
          const forkBase = new THREE.Vector3(
            elbow.x + cosA * innerLen * 0.25,
            elbow.y + forkR * 0.6,
            elbow.z + sinA * innerLen * 0.25
          );
          const forkTip = new THREE.Vector3(
            forkBase.x + Math.cos(forkAngle) * forkLen,
            forkBase.y + forkLen * 0.22,
            forkBase.z + Math.sin(forkAngle) * forkLen
          );
          this._addBranchSegment(solidParts, materials, worldOffset, forkBase, forkTip, forkR, forkR * 0.4);
        }

        // Foliage clumps hugging the limb elbow and tip
        const folMat = Math.random() > 0.3
          ? materials.foliageMat1
          : (Math.random() > 0.5 ? materials.foliageMat2 : materials.foliageMat3);

        const clumpGeo = new THREE.DodecahedronGeometry(baseRadius * (2.4 + Math.random() * 1.6), 1);
        clumpGeo.scale(1.5, 0.8, 1.35);

        const elbowClump = clumpGeo.clone();
        elbowClump.translate(elbow.x, elbow.y + baseRadius * 1.5, elbow.z);
        this._bucketAdd(solidParts, folMat, elbowClump);

        const tipClump = clumpGeo.clone();
        tipClump.translate(tip.x, tip.y + baseRadius * 0.8, tip.z);
        this._bucketAdd(solidParts, folMat, tipClump);
        clumpGeo.dispose();

        // Hanging vines from the elbow
        if (Math.random() > 0.35) {
          const vineLen = 14 + Math.random() * 28;
          const vineGeo = new THREE.CylinderGeometry(0.18, 0.05, vineLen, 4);
          vineGeo.translate(
            elbow.x + cosT * innerLen * 0.3,
            elbow.y - vineLen * 0.5,
            elbow.z + sinT * innerLen * 0.3
          );
          this._bucketAdd(lightParts, materials.vineMat, vineGeo);
        }
      }
    }

    // 4. Crown Canopy
    const crownCount = isTitan ? 6 : 4;
    for (let c = 0; c < crownCount; c++) {
      const crownR = trunkRadius * (2.4 + Math.random() * 2.2);
      const crownGeo = new THREE.DodecahedronGeometry(crownR, 1);
      crownGeo.scale(1.6, 0.85, 1.6);
      crownGeo.translate(
        (Math.random() - 0.5) * (trunkRadius * 1.6),
        height + trunkRadius * 1.2 + c * trunkRadius * 0.5,
        (Math.random() - 0.5) * (trunkRadius * 1.6)
      );
      this._bucketAdd(solidParts, c === 0 ? materials.foliageMat2 : materials.foliageMat1, crownGeo);
    }

    this._flushBuckets(treeGroup, solidParts, true);
    this._flushBuckets(treeGroup, lightParts, false);

    this.scene.add(treeGroup);
    this.trees.push(treeGroup);
  }

  _generateForestFloorDetails() {
    // 1. Bioluminescent Giant Mushrooms across the vast forest
    const shroomCapGeo = new THREE.SphereGeometry(1.6, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const shroomStemGeo = new THREE.CylinderGeometry(0.3, 0.55, 2.5, 6);

    const shroomColors = [
      { cap: 0x00f2ff, glow: 0x00a2ff },
      { cap: 0xa855f7, glow: 0x8b5cf6 },
      { cap: 0xffaa00, glow: 0xff7700 }
    ];

    for (let i = 0; i < 140; i++) {
      const x = (Math.random() - 0.5) * 2400;
      const z = (Math.random() - 0.5) * 2400;
      const y = this.getTerrainHeight(x, z);

      if (y > 3 && y < 95) {
        const shroomGroup = new THREE.Group();
        shroomGroup.position.set(x, y, z);
        const s = 0.7 + Math.random() * 1.1;
        shroomGroup.scale.set(s, s, s);

        const col = shroomColors[i % shroomColors.length];
        const stemMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 });
        const capMat = new THREE.MeshStandardMaterial({
          color: col.cap,
          emissive: col.glow,
          emissiveIntensity: 0.75,
          roughness: 0.3
        });

        const stem = new THREE.Mesh(shroomStemGeo, stemMat);
        stem.position.y = 1.25;
        shroomGroup.add(stem);

        const cap = new THREE.Mesh(shroomCapGeo, capMat);
        cap.position.y = 2.4;
        shroomGroup.add(cap);

        this.scene.add(shroomGroup);
      }
    }

    // 2. Giant Fallen Hollow Mossy Logs
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3d2516, roughness: 0.95, side: THREE.DoubleSide });
    const halfLogLen = 16;

    for (let i = 0; i < 35; i++) {
      const lx = (Math.random() - 0.5) * 2200;
      const lz = (Math.random() - 0.5) * 2200;
      const ly = this.getTerrainHeight(lx, lz) + 3.6;
      const logAngle = Math.random() * Math.PI;

      const logGeo = new THREE.CylinderGeometry(3.5, 4.0, halfLogLen * 2, 8, 1, true);
      logGeo.rotateZ(Math.PI / 2);
      const logMesh = new THREE.Mesh(logGeo, logMat);
      logMesh.position.set(lx, ly, lz);
      logMesh.rotation.y = logAngle;
      logMesh.castShadow = true;
      logMesh.receiveShadow = true;
      this.scene.add(logMesh);

      // Collider follows the real log orientation
      const dx = Math.cos(logAngle) * halfLogLen;
      const dz = -Math.sin(logAngle) * halfLogLen;
      this._registerBranch(
        new THREE.Vector3(lx - dx, ly, lz - dz),
        new THREE.Vector3(lx + dx, ly, lz + dz),
        3.9
      );
    }
  }

  _generateSunbeams() {
    this.sunbeamGroup = new THREE.Group();
    const beamGeo = new THREE.CylinderGeometry(22, 70, 320, 8, 1, true);
    beamGeo.rotateX(0.25);
    beamGeo.rotateZ(-0.25);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const beamPositions = [
      { x: 30, z: 45, y: 150 },
      { x: -350, z: 220, y: 160 },
      { x: 420, z: -380, y: 145 },
      { x: -650, z: -520, y: 155 },
      { x: 750, z: 620, y: 170 },
      { x: 0, z: 800, y: 165 }
    ];

    beamPositions.forEach(pos => {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(pos.x, pos.y, pos.z);
      this.sunbeamGroup.add(beam);
    });

    this.scene.add(this.sunbeamGroup);
  }

  _generateThermalClearings() {
    const updraftLocations = [
      { x: 90, z: 110, r: 45, h: 320, strength: 22, name: 'Sunbeam Clearing' },
      { x: -420, z: -350, r: 50, h: 340, strength: 24, name: 'Elder Glade Updraft' },
      { x: 620, z: -280, r: 48, h: 330, strength: 22, name: 'River Canyon Thermal' },
      { x: -550, z: 680, r: 52, h: 350, strength: 25, name: 'Emerald Basin Lift' },
      { x: 800, z: 750, r: 55, h: 360, strength: 26, name: 'High Ridge Vortex' },
      { x: -900, z: -850, r: 55, h: 360, strength: 26, name: 'Ancient Highlands Thermal' },
      { x: 0, z: -800, r: 60, h: 370, strength: 28, name: 'Deep Valley Updraft' }
    ];

    updraftLocations.forEach(cfg => {
      const terrainY = this.getTerrainHeight(cfg.x, cfg.z);
      const group = new THREE.Group();
      group.position.set(cfg.x, terrainY, cfg.z);

      const ringCount = 8;
      const rings = [];
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x90e0ef,
        transparent: true,
        opacity: 0.38,
        wireframe: true
      });

      for (let i = 0; i < ringCount; i++) {
        const ringGeo = new THREE.TorusGeometry(cfg.r * (0.6 + i * 0.05), 0.55, 4, 16);
        ringGeo.rotateX(Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = (cfg.h / ringCount) * i;
        group.add(ring);
        rings.push(ring);
      }

      this.scene.add(group);
      this.updrafts.push({
        position: new THREE.Vector3(cfg.x, terrainY, cfg.z),
        radius: cfg.r,
        height: cfg.h,
        strength: cfg.strength,
        group: group,
        rings: rings
      });
    });
  }

  // Build the dynamic, upgradable Nest Base Structure
  _buildNestBaseStructure() {
    if (this.nestGroup) {
      this.scene.remove(this.nestGroup);
    }
    if (this._nestPerch) {
      this._removeBranch(this._nestPerch);
      this._nestPerch = null;
    }
    if (this._nestArm) {
      this._removeBranch(this._nestArm);
      this._nestArm = null;
    }

    const nestX = 54;
    const nestZ = 45;
    const nestY = 85; // High limb of the Ancestral Great Tree (85m elevation)

    // Solid limb carrying the nest out from the trunk
    if (!this._nestArmMesh) {
      const armMat = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.94, flatShading: true });
      const trunkX = 30;
      const armStart = new THREE.Vector3(trunkX + 16, nestY + 0.6, nestZ);
      const armEnd = new THREE.Vector3(nestX + 1.5, nestY, nestZ);
      const armLen = new THREE.Vector3().subVectors(armEnd, armStart).length();
      const armGeo = new THREE.CylinderGeometry(2.0, 3.0, armLen, 8);
      const armMesh = new THREE.Mesh(armGeo, armMat);
      const armDir = new THREE.Vector3().subVectors(armEnd, armStart).normalize();
      armMesh.position.copy(armStart).addScaledVector(armDir, armLen / 2);
      armMesh.quaternion.setFromUnitVectors(UP_AXIS, armDir);
      armMesh.castShadow = true;
      armMesh.receiveShadow = true;
      this.scene.add(armMesh);
      this._nestArmMesh = armMesh;
      this._nestArm = this._registerBranch(armStart, armEnd, 2.4, { perchable: false });
    }

    this.nestGroup = new THREE.Group();
    this.nestGroup.position.set(nestX, nestY, nestZ);

    const level = this.nestLevel;

    // 1. Base Woven Twig Bowl
    const nestOuterGeo = new THREE.CylinderGeometry(4.2 + level * 0.4, 3.2, 1.4 + level * 0.3, 16);
    const nestOuterMat = new THREE.MeshStandardMaterial({
      color: level >= 3 ? 0x614023 : 0x4a2e16,
      roughness: 0.95
    });
    const nestOuterMesh = new THREE.Mesh(nestOuterGeo, nestOuterMat);
    this.nestGroup.add(nestOuterMesh);

    // 2. Soft Bedding Interior
    const nestInnerGeo = new THREE.CylinderGeometry(3.6 + level * 0.35, 2.8, 0.5, 16);
    const beddingColor = level === 1 ? 0x2e6b35 : (level === 2 ? 0x38bdf8 : 0xfde047);
    const nestInnerMat = new THREE.MeshStandardMaterial({
      color: beddingColor,
      roughness: 0.85
    });
    const nestInnerMesh = new THREE.Mesh(nestInnerGeo, nestInnerMat);
    nestInnerMesh.position.y = 0.55;
    this.nestGroup.add(nestInnerMesh);

    // 3. Level 2+: Reinforced Bark Posts
    if (level >= 2) {
      const postMat = new THREE.MeshStandardMaterial({ color: 0x542813, roughness: 0.9 });
      for (let p = 0; p < 4; p++) {
        const postAngle = (p / 4) * Math.PI * 2;
        const postGeo = new THREE.CylinderGeometry(0.2, 0.25, 2.2, 5);
        const postMesh = new THREE.Mesh(postGeo, postMat);
        postMesh.position.set(
          Math.cos(postAngle) * 4.0,
          1.2,
          Math.sin(postAngle) * 4.0
        );
        this.nestGroup.add(postMesh);
      }
    }

    // 4. Level 3+: Golden Acorns Ring
    if (level >= 3) {
      const acornMat = new THREE.MeshStandardMaterial({ color: 0xffb703, metalness: 0.4, roughness: 0.3 });
      for (let a = 0; a < 8; a++) {
        const acornAngle = (a / 8) * Math.PI * 2;
        const acornGeo = new THREE.DodecahedronGeometry(0.35, 0);
        const acornMesh = new THREE.Mesh(acornGeo, acornMat);
        acornMesh.position.set(
          Math.cos(acornAngle) * 3.8,
          0.9,
          Math.sin(acornAngle) * 3.8
        );
        this.nestGroup.add(acornMesh);
      }
    }

    // 5. Level 4 (Max): 3 Cute Golden Songbird Eggs & Royal Protective Aura
    if (level >= 4) {
      const eggMat = new THREE.MeshStandardMaterial({ color: 0xeff6ff, roughness: 0.2, metalness: 0.1 });
      for (let e = 0; e < 3; e++) {
        const eggGeo = new THREE.SphereGeometry(0.45, 8, 8);
        eggGeo.scale(0.85, 1.2, 0.85);
        const eggMesh = new THREE.Mesh(eggGeo, eggMat);
        eggMesh.position.set(
          Math.cos((e / 3) * Math.PI * 2) * 0.8,
          0.85,
          Math.sin((e / 3) * Math.PI * 2) * 0.8
        );
        this.nestGroup.add(eggMesh);
      }

      const auraGeo = new THREE.TorusGeometry(5.2, 0.15, 6, 24);
      auraGeo.rotateX(Math.PI / 2);
      const auraMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6 });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.position.y = 1.0;
      this.nestGroup.add(auraMesh);
    }

    // Warm Sanctuary Beacon Light
    const lightIntensity = 2.0 + level * 0.8;
    const beaconLight = new THREE.PointLight(0xffb703, lightIntensity, 40 + level * 10);
    beaconLight.position.set(0, 2.5, 0);
    this.nestGroup.add(beaconLight);

    // Sanctuary Beacon Crystal
    const crystalGeo = new THREE.OctahedronGeometry(0.7 + level * 0.15, 0);
    const crystalMat = new THREE.MeshBasicMaterial({ color: level >= 3 ? 0x00f2ff : 0xffd166 });
    this.nestCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    this.nestCrystal.position.set(0, 2.8, 0);
    this.nestGroup.add(this.nestCrystal);

    this.scene.add(this.nestGroup);
    this.nestSite = { position: new THREE.Vector3(nestX, nestY + 0.8, nestZ) };

    // Nest rim is a perchable surface (bird stands inside the bowl)
    this._nestPerch = this._registerBranch(
      new THREE.Vector3(nestX - 3.4, nestY + 0.85, nestZ),
      new THREE.Vector3(nestX + 3.4, nestY + 0.85, nestZ),
      1.15
    );
  }

  _removeBranch(branch) {
    if (!branch) return;
    const idx = this.branches.indexOf(branch);
    if (idx >= 0) this.branches.splice(idx, 1);
    if (this.branchGrid) {
      this.branchGrid.forEach(cell => {
        const i = cell.indexOf(branch);
        if (i >= 0) cell.splice(i, 1);
      });
    }
  }

  // Exact spot where the bird stands when resting in the nest
  getNestStandPosition() {
    const perch = this.getPerchSurface(this.nestSite.position, 0.55);
    return new THREE.Vector3(
      this.nestSite.position.x,
      perch.height + (perch.isBranch ? 0.22 : 0.25),
      this.nestSite.position.z
    );
  }

  // Attempt to deposit collected materials to upgrade the Nest Base
  depositMaterialsToNest(bird) {
    if (this.nestLevel >= this.nestMaxLevel) {
      return { success: false, reason: 'MAX_LEVEL', message: 'Nest is at Maximum Royal Level (4/4)!' };
    }

    const nextLvl = this.nestLevel + 1;
    const req = this.nestUpgradeRequirements[nextLvl];
    const inv = bird.inventory;

    const hasTwigs = (inv.twigs || 0) >= req.twigs;
    const hasFeathers = (inv.feathers || 0) >= req.feathers;
    const hasPebbles = (inv.pebbles || 0) >= req.pebbles;
    const hasBerries = (inv.berries || 0) >= req.berries;

    if (!hasTwigs || !hasFeathers || !hasPebbles || !hasBerries) {
      const missing = [];
      if (!hasTwigs) missing.push(`${req.twigs - (inv.twigs || 0)} Twigs`);
      if (!hasFeathers) missing.push(`${req.feathers - (inv.feathers || 0)} Feathers`);
      if (!hasPebbles) missing.push(`${req.pebbles - (inv.pebbles || 0)} Acorns`);
      if (!hasBerries) missing.push(`${req.berries - (inv.berries || 0)} Berries`);
      return {
        success: false,
        reason: 'NEED_MATERIALS',
        message: `Need: ${missing.join(', ')} to upgrade to ${req.name}!`
      };
    }

    inv.twigs -= req.twigs;
    inv.feathers -= req.feathers;
    inv.pebbles -= req.pebbles;
    inv.berries -= req.berries;

    this.nestLevel = nextLvl;
    this._buildNestBaseStructure();

    bird.maxStamina += 25;
    bird.stamina = bird.maxStamina;
    bird.maxHealth += 25;
    bird.health = bird.maxHealth;

    return {
      success: true,
      level: this.nestLevel,
      name: req.name,
      message: `🎉 NEST UPGRADED TO LEVEL ${this.nestLevel}: ${req.name}! (+Max Stamina, +Max HP)`
    };
  }

  _generateForestCollectibles() {
    const resourceTypes = [
      { type: 'berries', color: 0xef233c, geo: new THREE.SphereGeometry(0.28, 6, 6) },
      { type: 'twigs', color: 0x8b5a2b, geo: new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5) },
      { type: 'feathers', color: 0x38bdf8, geo: new THREE.ConeGeometry(0.2, 0.8, 4) },
      { type: 'pebbles', color: 0xffb703, geo: new THREE.DodecahedronGeometry(0.28, 0) } // Golden Acorn
    ];

    for (let i = 0; i < 220; i++) {
      const typeCfg = resourceTypes[i % resourceTypes.length];
      let rx, rz, ry;

      if (i % 2 === 0 && this.branches.length > 0) {
        const b = this.branches[Math.floor(Math.random() * this.branches.length)];
        const t = 0.25 + Math.random() * 0.5;
        rx = b.p1.x + (b.p2.x - b.p1.x) * t;
        rz = b.p1.z + (b.p2.z - b.p1.z) * t;
        ry = b.p1.y + (b.p2.y - b.p1.y) * t + b.radius + 0.35;
      } else {
        rx = (Math.random() - 0.5) * 2400;
        rz = (Math.random() - 0.5) * 2400;
        ry = this.getTerrainHeight(rx, rz) + 0.5;
      }

      if (ry > 2) {
        const rMat = new THREE.MeshStandardMaterial({
          color: typeCfg.color,
          roughness: 0.4,
          metalness: 0.2,
          emissive: typeCfg.color,
          emissiveIntensity: 0.35
        });
        const rMesh = new THREE.Mesh(typeCfg.geo, rMat);
        rMesh.position.set(rx, ry, rz);
        rMesh.castShadow = true;
        this.scene.add(rMesh);

        this.resources.push({
          mesh: rMesh,
          type: typeCfg.type,
          position: new THREE.Vector3(rx, ry, rz),
          collected: false
        });
      }
    }
  }

  _generateForestParticles() {
    const leafCount = 550;
    const leafGeo = new THREE.PlaneGeometry(0.4, 0.5);
    const leafMat = new THREE.MeshBasicMaterial({
      color: 0x72c442,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });

    this.floatingLeaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
    this.leafData = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < leafCount; i++) {
      const px = (Math.random() - 0.5) * 1200;
      const py = 20 + Math.random() * 200;
      const pz = (Math.random() - 0.5) * 1200;
      const rotX = Math.random() * Math.PI;
      const rotY = Math.random() * Math.PI;
      const rotZ = Math.random() * Math.PI;
      const speed = 0.8 + Math.random() * 1.6;

      dummy.position.set(px, py, pz);
      dummy.rotation.set(rotX, rotY, rotZ);
      dummy.updateMatrix();
      this.floatingLeaves.setMatrixAt(i, dummy.matrix);

      this.leafData.push({
        pos: new THREE.Vector3(px, py, pz),
        rot: new THREE.Euler(rotX, rotY, rotZ),
        speed: speed,
        swayPhase: Math.random() * Math.PI * 2
      });
    }
    this.floatingLeaves.instanceMatrix.needsUpdate = true;
    this.scene.add(this.floatingLeaves);

    const sporeCount = 600;
    const sporeGeo = new THREE.BufferGeometry();
    const sporePos = [];
    for (let i = 0; i < sporeCount; i++) {
      sporePos.push(
        (Math.random() - 0.5) * 1200,
        5 + Math.random() * 180,
        (Math.random() - 0.5) * 1200
      );
    }
    sporeGeo.setAttribute('position', new THREE.Float32BufferAttribute(sporePos, 3));
    const sporeMat = new THREE.PointsMaterial({
      color: 0xffe066,
      size: 0.7,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    this.glowingSpores = new THREE.Points(sporeGeo, sporeMat);
    this.scene.add(this.glowingSpores);
  }

  _spawnForestPredators() {
    const enemySpawns = [
      { pos: new THREE.Vector3(70, 140, 70), type: 'hawk' },
      { pos: new THREE.Vector3(-450, 150, -320), type: 'owl' },
      { pos: new THREE.Vector3(650, 180, -580), type: 'hawk' },
      { pos: new THREE.Vector3(-720, 140, 680), type: 'raven' },
      { pos: new THREE.Vector3(380, 160, 850), type: 'hawk' },
      { pos: new THREE.Vector3(-350, 130, -950), type: 'owl' },
      { pos: new THREE.Vector3(0, 150, -420), type: 'raven' },
      { pos: new THREE.Vector3(880, 160, 360), type: 'hawk' },
      { pos: new THREE.Vector3(-1100, 170, 450), type: 'owl' },
      { pos: new THREE.Vector3(950, 165, -1100), type: 'hawk' }
    ];

    enemySpawns.forEach(spawn => {
      const enemy = new EnemyBird(this.scene, spawn.pos, spawn.type);
      this.enemies.push(enemy);
    });
  }

  update(delta, bird, combatSystem, camera) {
    this.updrafts.forEach(u => {
      u.rings.forEach((ring, idx) => {
        ring.rotation.z += delta * (1.2 + idx * 0.15);
        ring.position.y += delta * 16;
        if (ring.position.y > u.height) {
          ring.position.y = 0;
        }
      });
    });

    if (this.nestCrystal) {
      this.nestCrystal.rotation.y += delta * 2.2;
      this.nestCrystal.position.y = 2.8 + Math.sin(Date.now() * 0.003) * 0.25;
    }

    if (this.floatingLeaves && this.leafData) {
      const dummy = new THREE.Object3D();
      const birdPos = bird.position;
      for (let i = 0; i < this.leafData.length; i++) {
        const d = this.leafData[i];
        d.pos.y -= delta * d.speed;
        d.pos.x += Math.sin(Date.now() * 0.0015 + d.swayPhase) * delta * 2.5;
        d.pos.z += Math.cos(Date.now() * 0.0015 + d.swayPhase) * delta * 2.0;
        d.rot.x += delta * 1.5;
        d.rot.y += delta * 1.2;

        if (d.pos.y < this.getTerrainHeight(d.pos.x, d.pos.z) + 1.0) {
          d.pos.y = birdPos.y + 40 + Math.random() * 60;
          d.pos.x = birdPos.x + (Math.random() - 0.5) * 220;
          d.pos.z = birdPos.z + (Math.random() - 0.5) * 220;
        }

        dummy.position.copy(d.pos);
        dummy.rotation.copy(d.rot);
        dummy.updateMatrix();
        this.floatingLeaves.setMatrixAt(i, dummy.matrix);
      }
      this.floatingLeaves.instanceMatrix.needsUpdate = true;
    }

    if (this.glowingSpores) {
      const positions = this.glowingSpores.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] += Math.sin(Date.now() * 0.001 + i) * 0.05;
      }
      this.glowingSpores.geometry.attributes.position.needsUpdate = true;
    }

    if (this.enemies) {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        if (enemy.isDead) {
          this.enemies.splice(i, 1);
          continue;
        }
        enemy.update(delta, bird, combatSystem, camera);
      }
    }

    this.resources.forEach(res => {
      if (!res.collected) {
        res.mesh.rotation.y += delta * 1.8;
        const dist = bird.position.distanceTo(res.position);
        if (dist < 3.5) {
          res.collected = true;
          this.scene.remove(res.mesh);
          bird.inventory[res.type] = (bird.inventory[res.type] || 0) + 1;
          if (window.onResourceCollected) {
            window.onResourceCollected(res.type, bird.inventory);
          }
        }
      }
    });
  }
}
