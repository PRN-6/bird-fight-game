import * as THREE from 'three';

export class Projectile {
  constructor(scene, startPos, direction, speed = 65, damage = 35, owner = 'player') {
    this.scene = scene;
    this.position = startPos.clone();
    this.direction = direction.clone().normalize();
    this.speed = speed;
    this.damage = damage;
    this.owner = owner;
    this.life = 2.5; // seconds
    this.isDead = false;
    this.radius = 0.8;

    this._buildMesh();
  }

  _buildMesh() {
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    // Glowing Crescent Wind Blade / Feather Missile
    const bladeGeo = new THREE.TorusGeometry(0.7, 0.12, 6, 16, Math.PI * 0.8);
    bladeGeo.rotateZ(Math.PI / 2);
    bladeGeo.rotateY(Math.PI / 2);

    const bladeMat = new THREE.MeshBasicMaterial({
      color: this.owner === 'player' ? 0x00f2ff : 0xff3366,
      transparent: true,
      opacity: 0.95
    });

    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    this.mesh.add(bladeMesh);

    // Inner Glow Core
    const coreGeo = new THREE.SphereGeometry(0.25, 6, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.mesh.add(coreMesh);

    // Orient blade towards travel direction
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.direction);
    this.scene.add(this.mesh);
  }

  update(delta) {
    this.life -= delta;
    if (this.life <= 0) {
      this.destroy();
      return;
    }

    this.position.addScaledVector(this.direction, this.speed * delta);
    this.mesh.position.copy(this.position);
    this.mesh.rotateZ(delta * 15); // Spin effect
  }

  destroy() {
    this.isDead = true;
    if (this.mesh) {
      this.scene.remove(this.mesh);
    }
  }
}

export class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
  }

  spawnWindBlade(startPos, direction, damage = 40, owner = 'player') {
    const proj = new Projectile(this.scene, startPos, direction, 75, damage, owner);
    this.projectiles.push(proj);
    return proj;
  }

  spawnSonicShockwave(centerPos, radius = 25, damage = 50, owner = 'player') {
    const shockwaveGeo = new THREE.RingGeometry(0.5, 2.0, 32);
    shockwaveGeo.rotateX(-Math.PI / 2);

    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0x00f2ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(shockwaveGeo, shockwaveMat);
    mesh.position.copy(centerPos);
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      position: centerPos.clone(),
      currentRadius: 1,
      maxRadius: radius,
      damage,
      owner,
      hitEntities: new Set()
    });
  }

  spawnHitParticles(pos, colorHex = 0xffa500, count = 12) {
    for (let i = 0; i < count; i++) {
      const pGeo = new THREE.SphereGeometry(0.12, 4, 4);
      const pMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.copy(pos);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.2) * 16,
        (Math.random() - 0.5) * 16
      );

      this.scene.add(pMesh);
      this.particles.push({
        mesh: pMesh,
        vel,
        life: 0.5,
        maxLife: 0.5
      });
    }
  }

  showDamageText(pos, amount, isCrit = false) {
    const container = document.getElementById('hud-root');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `floating-dmg ${isCrit ? 'crit' : ''}`;
    el.textContent = `${isCrit ? '💥 ' : ''}-${Math.round(amount)}`;
    container.appendChild(el);

    // Convert 3D world pos to 2D screen coordinates in HUD update loop
    el.dataset.worldX = pos.x;
    el.dataset.worldY = pos.y + 1.2;
    el.dataset.worldZ = pos.z;
    el.dataset.life = '1.0';

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 900);
  }

  update(delta, player, enemies, camera) {
    // 1. Update Wind Blade Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(delta);

      if (p.isDead) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Collision vs Enemies (Player projectiles)
      if (p.owner === 'player') {
        for (const enemy of enemies) {
          if (!enemy.isDead && p.position.distanceTo(enemy.position) < (p.radius + enemy.hitRadius)) {
            enemy.takeDamage(p.damage, player);
            this.spawnHitParticles(p.position, 0x00f2ff, 16);
            this.showDamageText(enemy.position, p.damage, false);
            p.destroy();
            this.projectiles.splice(i, 1);
            break;
          }
        }
      } else {
        // Enemy projectile vs Player
        if (p.position.distanceTo(player.position) < (p.radius + 1.2)) {
          player.health = Math.max(0, player.health - p.damage);
          this.spawnHitParticles(player.position, 0xff3366, 16);
          this.showDamageText(player.position, p.damage, false);
          p.destroy();
          this.projectiles.splice(i, 1);
        }
      }
    }

    // 2. Update Sonic Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.currentRadius += delta * 45;
      const progress = sw.currentRadius / sw.maxRadius;

      sw.mesh.scale.set(sw.currentRadius, sw.currentRadius, 1);
      sw.mesh.material.opacity = Math.max(0, (1 - progress) * 0.9);

      if (sw.owner === 'player') {
        enemies.forEach(enemy => {
          if (!enemy.isDead && !sw.hitEntities.has(enemy)) {
            const dist = sw.position.distanceTo(enemy.position);
            if (Math.abs(dist - sw.currentRadius) < 4.0) {
              sw.hitEntities.add(enemy);
              enemy.takeDamage(sw.damage, player);
              this.spawnHitParticles(enemy.position, 0x00f2ff, 14);
              this.showDamageText(enemy.position, sw.damage, true);
            }
          }
        });
      }

      if (progress >= 1.0) {
        this.scene.remove(sw.mesh);
        this.shockwaves.splice(i, 1);
      }
    }

    // 3. Update Hit Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= delta;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      pt.mesh.position.addScaledVector(pt.vel, delta);
      pt.mesh.material.opacity = pt.life / pt.maxLife;
    }

    // 4. Update Floating Damage screen positions
    const dmgElements = document.querySelectorAll('.floating-dmg');
    dmgElements.forEach(el => {
      const wx = parseFloat(el.dataset.worldX);
      const wy = parseFloat(el.dataset.worldY);
      const wz = parseFloat(el.dataset.worldZ);

      const p = new THREE.Vector3(wx, wy, wz).project(camera);
      if (p.z < 1) {
        const x = (p.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    });
  }
}
