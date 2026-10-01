import * as THREE from 'three';
import { EnemyBird } from '../entities/EnemyBird.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.size = 1200; // 1200x1200m open world terrain
    this.resolution = 128;
    this.heightData = [];
    this.trees = [];
    this.rocks = [];
    this.updrafts = [];
    this.resources = [];
    this.floatingIslands = [];
    this.enemies = [];

    // Ambient Wind vector
    this.wind = new THREE.Vector3(2.5, 0, -1.2);

    this._generateTerrain();
    this._generateFloatingIslands();
    this._generateTreesAndRocks();
    this._generateUpdrafts();
    this._generateResourcesAndNest();
    this._generateAtmosphere();
    this._spawnEnemyFlocks();
  }

  // Multi-octave Simplex/Perlin-like procedural noise
  _noise(x, z) {
    const s1 = Math.sin(x * 0.005) * Math.cos(z * 0.005) * 45;
    const s2 = Math.sin(x * 0.015 + 1.4) * Math.cos(z * 0.015 + 2.1) * 22;
    const s3 = Math.sin(x * 0.04 + 3.2) * Math.cos(z * 0.04 + 0.8) * 8;
    const s4 = Math.sin(x * 0.1) * Math.sin(z * 0.1) * 2.5;

    // Mountain peak generator at center-north
    const distToCenter = Math.hypot(x - 60, z - 80);
    const mountain = Math.max(0, 110 - distToCenter * 0.45);
    const mountainRidge = Math.sin(distToCenter * 0.08) * 15;

    // Coastline falloff towards ocean border
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));
    let falloff = 1.0;
    if (edgeDist > 450) {
      falloff = THREE.MathUtils.clamp((580 - edgeDist) / 130, -0.3, 1.0);
    }

    const rawHeight = (s1 + s2 + s3 + s4 + mountain + mountainRidge) * falloff;
    return Math.max(-12, rawHeight);
  }

  getTerrainHeight(x, z) {
    // Check floating islands first if directly over one
    for (const island of this.floatingIslands) {
      const dist = Math.hypot(x - island.position.x, z - island.position.z);
      if (dist < island.radius) {
        return island.position.y + 1.5;
      }
    }
    return this._noise(x, z);
  }

  getWind(pos) {
    return this.wind;
  }

  getUpdraftAt(pos) {
    for (const u of this.updrafts) {
      const distXZ = Math.hypot(pos.x - u.position.x, pos.z - u.position.z);
      if (distXZ < u.radius && pos.y >= u.position.y && pos.y <= u.position.y + u.height) {
        // Updraft strength peaks near the center of the thermal cylinder
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

    // Custom Biome Vertex Colors (Coast sand, lush green grass, mountain rock, snow peak)
    const colorSand = new THREE.Color(0xdac08b);
    const colorGrass = new THREE.Color(0x3a7337);
    const colorForest = new THREE.Color(0x234d20);
    const colorRock = new THREE.Color(0x615b57);
    const colorSnow = new THREE.Color(0xedf2f7);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this._noise(x, z);
      pos.setY(i, y);

      let vertexColor = new THREE.Color();
      if (y < 2) {
        vertexColor.copy(colorSand);
      } else if (y < 25) {
        vertexColor.lerpColors(colorGrass, colorForest, (y - 2) / 23);
      } else if (y < 65) {
        vertexColor.lerpColors(colorForest, colorRock, (y - 25) / 40);
      } else {
        vertexColor.lerpColors(colorRock, colorSnow, (y - 65) / 30);
      }
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true
    });

    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    // Ocean Water Plane
    const oceanGeo = new THREE.PlaneGeometry(this.size * 1.5, this.size * 1.5);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1a6b8c,
      transparent: true,
      opacity: 0.82,
      roughness: 0.15,
      metalness: 0.4
    });
    this.ocean = new THREE.Mesh(oceanGeo, oceanMat);
    this.ocean.position.y = 0;
    this.scene.add(this.ocean);
  }

  _generateFloatingIslands() {
    // Sky islands (ancient floating monoliths perfect for perching & building high nests)
    const islandConfigs = [
      { x: 120, y: 95, z: -140, r: 24, name: 'Aerie Spire' },
      { x: -160, y: 110, z: 80, r: 32, name: 'Cloud Haven' },
      { x: 40, y: 130, z: 220, r: 20, name: 'Gryphon Roost' },
      { x: -90, y: 85, z: -200, r: 28, name: 'Zephyr Rock' }
    ];

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4d463f, roughness: 0.9, flatShading: true });
    const grassTopMat = new THREE.MeshStandardMaterial({ color: 0x448a3c, roughness: 0.7, flatShading: true });

    islandConfigs.forEach(cfg => {
      const islandGroup = new THREE.Group();
      islandGroup.position.set(cfg.x, cfg.y, cfg.z);

      // Inverted cone base for floating rock
      const baseGeo = new THREE.ConeGeometry(cfg.r, cfg.r * 1.6, 9);
      baseGeo.rotateX(Math.PI);
      const baseMesh = new THREE.Mesh(baseGeo, rockMat);
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      islandGroup.add(baseMesh);

      // Lush grassy top plateau
      const topGeo = new THREE.CylinderGeometry(cfg.r * 0.95, cfg.r, 2.5, 9);
      const topMesh = new THREE.Mesh(topGeo, grassTopMat);
      topMesh.position.y = 0.8;
      topMesh.receiveShadow = true;
      islandGroup.add(topMesh);

      this.scene.add(islandGroup);
      this.floatingIslands.push({
        position: new THREE.Vector3(cfg.x, cfg.y, cfg.z),
        radius: cfg.r,
        name: cfg.name
      });
    });
  }

  _generateTreesAndRocks() {
    // Instanced or grouped low-poly pine & redwood trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1f4e24, roughness: 0.7, flatShading: true });
    const autumnFoliageMat = new THREE.MeshStandardMaterial({ color: 0xc46210, roughness: 0.7, flatShading: true });

    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.9, 8, 6);
    const foliageGeo1 = new THREE.ConeGeometry(4.5, 8, 7);
    const foliageGeo2 = new THREE.ConeGeometry(3.5, 6, 7);
    const foliageGeo3 = new THREE.ConeGeometry(2.2, 5, 7);

    // Place trees across valley and hills (skip water and high snow peaks)
    for (let i = 0; i < 220; i++) {
      const x = (Math.random() - 0.5) * 800;
      const z = (Math.random() - 0.5) * 800;
      const y = this.getTerrainHeight(x, z);

      if (y > 3 && y < 55) {
        const treeGroup = new THREE.Group();
        treeGroup.position.set(x, y, z);
        const scale = 0.8 + Math.random() * 0.9;
        treeGroup.scale.set(scale, scale, scale);

        // Trunk
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 4;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Tiered Conical Foliage
        const mat = Math.random() > 0.15 ? foliageMat : autumnFoliageMat;
        const f1 = new THREE.Mesh(foliageGeo1, mat);
        f1.position.y = 7;
        f1.castShadow = true;

        const f2 = new THREE.Mesh(foliageGeo2, mat);
        f2.position.y = 10.5;
        f2.castShadow = true;

        const f3 = new THREE.Mesh(foliageGeo3, mat);
        f3.position.y = 13.5;
        f3.castShadow = true;

        treeGroup.add(f1, f2, f3);
        this.scene.add(treeGroup);
        this.trees.push(treeGroup);
      }
    }

    // Huge Mountain Archway & Rock Pillars
    const archGeo = new THREE.TorusGeometry(35, 7, 8, 24, Math.PI);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.9, flatShading: true });
    const arch = new THREE.Mesh(archGeo, rockMat);
    arch.position.set(0, 32, -90);
    arch.castShadow = true;
    this.scene.add(arch);
  }

  _generateUpdrafts() {
    // Thermal Updraft Columns with animated swirling energy rings
    const updraftLocations = [
      { x: 50, z: -60, r: 28, h: 220, strength: 16 },
      { x: -140, z: 120, r: 35, h: 260, strength: 20 },
      { x: 180, z: 160, r: 30, h: 240, strength: 18 },
      { x: -220, z: -110, r: 32, h: 250, strength: 19 },
      { x: 0, z: 280, r: 40, h: 280, strength: 22 }
    ];

    updraftLocations.forEach(cfg => {
      const terrainY = this.getTerrainHeight(cfg.x, cfg.z);
      const group = new THREE.Group();
      group.position.set(cfg.x, terrainY, cfg.z);

      // Swirling golden particle spiral / vortex
      const ringCount = 8;
      const rings = [];
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.35,
        wireframe: true
      });

      for (let i = 0; i < ringCount; i++) {
        const ringGeo = new THREE.TorusGeometry(cfg.r * (0.6 + i * 0.05), 0.4, 4, 16);
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

  _generateResourcesAndNest() {
    // Nest Base Sanctuary Platform (placed on a majestic cliff top)
    const nestX = 30;
    const nestZ = 45;
    const nestY = this.getTerrainHeight(nestX, nestZ) + 0.3;

    const nestGroup = new THREE.Group();
    nestGroup.position.set(nestX, nestY, nestZ);

    // Circular woven twig base
    const nestGeo = new THREE.CylinderGeometry(4.5, 3.8, 0.8, 16);
    const nestMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.95 });
    const nestMesh = new THREE.Mesh(nestGeo, nestMat);
    nestGroup.add(nestMesh);

    // Warm Beacon Light
    const beaconLight = new THREE.PointLight(0xffaa33, 2, 25);
    beaconLight.position.set(0, 1.5, 0);
    nestGroup.add(beaconLight);

    // Beacon Crystal marker
    const crystalGeo = new THREE.OctahedronGeometry(0.8, 0);
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0xffdd66 });
    this.nestCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    this.nestCrystal.position.set(0, 1.8, 0);
    nestGroup.add(this.nestCrystal);

    this.scene.add(nestGroup);
    this.nestSite = { position: new THREE.Vector3(nestX, nestY, nestZ) };

    // Scatter collectible resources across the world
    const resourceTypes = [
      { type: 'twigs', color: 0x8b5a2b, geo: new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5) },
      { type: 'feathers', color: 0x48cae4, geo: new THREE.ConeGeometry(0.2, 0.8, 4) },
      { type: 'pebbles', color: 0xadb5bd, geo: new THREE.DodecahedronGeometry(0.3, 0) },
      { type: 'berries', color: 0xef233c, geo: new THREE.SphereGeometry(0.25, 6, 6) }
    ];

    for (let i = 0; i < 90; i++) {
      const typeCfg = resourceTypes[i % resourceTypes.length];
      const rx = (Math.random() - 0.5) * 600;
      const rz = (Math.random() - 0.5) * 600;
      const ry = this.getTerrainHeight(rx, rz) + 0.4;

      if (ry > 1) {
        const rMat = new THREE.MeshStandardMaterial({
          color: typeCfg.color,
          roughness: 0.5,
          metalness: 0.2,
          emissive: typeCfg.color,
          emissiveIntensity: 0.2
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

  _generateAtmosphere() {
    // Dynamic Cloud Layer & Floating Dust Motes
    const cloudGeo = new THREE.DodecahedronGeometry(18, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      roughness: 1.0
    });

    this.cloudGroup = new THREE.Group();
    for (let i = 0; i < 45; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      const cx = (Math.random() - 0.5) * 1200;
      const cz = (Math.random() - 0.5) * 1200;
      const cy = 160 + Math.random() * 80;
      cloud.position.set(cx, cy, cz);
      const s = 1.0 + Math.random() * 2.2;
      cloud.scale.set(s * 1.8, s * 0.7, s * 1.3);
      this.cloudGroup.add(cloud);
    }
    this.scene.add(this.cloudGroup);
  }

  _spawnEnemyFlocks() {
    // Spawn rival hawks near floating islands and ravens across valleys
    const enemySpawns = [
      { pos: new THREE.Vector3(120, 110, -140), type: 'hawk' },
      { pos: new THREE.Vector3(160, 100, -110), type: 'hawk' },
      { pos: new THREE.Vector3(-160, 125, 80), type: 'hawk' },
      { pos: new THREE.Vector3(-190, 115, 60), type: 'raven' },
      { pos: new THREE.Vector3(40, 145, 220), type: 'gryphon' },
      { pos: new THREE.Vector3(-90, 95, -200), type: 'raven' },
      { pos: new THREE.Vector3(0, 75, -80), type: 'raven' },
      { pos: new THREE.Vector3(80, 85, 90), type: 'hawk' },
    ];

    enemySpawns.forEach(spawn => {
      const enemy = new EnemyBird(this.scene, spawn.pos, spawn.type);
      this.enemies.push(enemy);
    });
  }

  update(delta, bird, combatSystem, camera) {
    // Animate Updraft swirling rings
    this.updrafts.forEach(u => {
      u.rings.forEach((ring, idx) => {
        ring.rotation.z += delta * (1.2 + idx * 0.15);
        ring.position.y += delta * 12;
        if (ring.position.y > u.height) {
          ring.position.y = 0;
        }
      });
    });

    // Animate Nest Crystal beacon
    if (this.nestCrystal) {
      this.nestCrystal.rotation.y += delta * 1.8;
      this.nestCrystal.position.y = 1.8 + Math.sin(Date.now() * 0.003) * 0.25;
    }

    // Drift clouds with ambient wind
    if (this.cloudGroup) {
      this.cloudGroup.position.addScaledVector(this.wind, delta * 2.0);
      if (this.cloudGroup.position.x > 600) this.cloudGroup.position.x = -600;
      if (this.cloudGroup.position.z > 600) this.cloudGroup.position.z = -600;
    }

    // Update Enemy Birds AI
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

    // Resource proximity pickup check
    this.resources.forEach(res => {
      if (!res.collected) {
        res.mesh.rotation.y += delta * 1.5;
        const dist = bird.position.distanceTo(res.position);
        if (dist < 4.0) {
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
