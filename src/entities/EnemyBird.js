import * as THREE from 'three';

export class EnemyBird extends THREE.Group {
  constructor(scene, startPos, type = 'hawk') {
    super();
    this.scene = scene;
    this.position.copy(startPos);
    this.type = type;

    // Stats
    this.maxHealth = type === 'gryphon' ? 220 : (type === 'hawk' ? 120 : 80);
    this.health = this.maxHealth;
    this.isDead = false;
    this.hitRadius = 1.4;
    this.speed = type === 'raven' ? 26 : 22;

    // AI States: 'patrol', 'chase', 'attack', 'retreat'
    this.aiState = 'patrol';
    this.patrolOrigin = startPos.clone();
    this.patrolRadius = 90;
    this.patrolTarget = new THREE.Vector3();
    this._pickNewPatrolTarget();

    this.attackCooldown = 0;
    this.attackRange = 40;
    this.velocity = new THREE.Vector3(0, 0, -this.speed);

    this.wingAnimTime = 0;
    this.flapCycle = 0;

    this._buildModel();
    this._buildHealthBar();
    this.scene.add(this);
  }

  _buildModel() {
    this.modelRoot = new THREE.Group();
    this.add(this.modelRoot);

    let mainColor = 0x8b1e1e; // Crimson Hawk
    let secondaryColor = 0x2b1111;
    if (this.type === 'raven') {
      mainColor = 0x1a1a2e;
      secondaryColor = 0x0f0f1a;
    } else if (this.type === 'gryphon') {
      mainColor = 0xb8860b;
      secondaryColor = 0x5c4033;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: mainColor,
      roughness: 0.7,
      metalness: 0.2,
      flatShading: true
    });
    const secMat = new THREE.MeshStandardMaterial({
      color: secondaryColor,
      roughness: 0.8,
      flatShading: true
    });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xff4422, roughness: 0.3 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });

    // Torso
    const bodyGeo = new THREE.ConeGeometry(0.4, 1.8, 7);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.castShadow = true;
    this.modelRoot.add(body);

    // Head
    const head = new THREE.Group();
    head.position.set(0, 0.22, -0.9);
    const headMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 1), secMat);
    head.add(headMesh);

    // Beak
    const beakGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
    beakGeo.rotateX(-Math.PI / 2);
    beakGeo.rotateX(0.25);
    const beakMesh = new THREE.Mesh(beakGeo, beakMat);
    beakMesh.position.set(0, -0.05, -0.35);
    head.add(beakMesh);

    // Glowing Predator Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), eyeMat);
    eyeL.position.set(0.16, 0.08, -0.16);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.16;
    head.add(eyeL, eyeR);
    this.modelRoot.add(head);

    // Articulated Wings
    this.leftWing = new THREE.Group();
    this.leftWing.position.set(0.3, 0.1, -0.2);
    const wingGeo = new THREE.BoxGeometry(1.4, 0.05, 0.5);
    const wingMeshL = new THREE.Mesh(wingGeo, mat);
    wingMeshL.position.set(0.7, 0, 0);
    this.leftWing.add(wingMeshL);
    this.modelRoot.add(this.leftWing);

    this.rightWing = new THREE.Group();
    this.rightWing.position.set(-0.3, 0.1, -0.2);
    const wingMeshR = new THREE.Mesh(wingGeo, mat);
    wingMeshR.position.set(-0.7, 0, 0);
    this.rightWing.add(wingMeshR);
    this.modelRoot.add(this.rightWing);

    // Tail
    const tailGeo = new THREE.BoxGeometry(0.8, 0.04, 0.7);
    const tailMesh = new THREE.Mesh(tailGeo, secMat);
    tailMesh.position.set(0, 0.08, 1.2);
    this.modelRoot.add(tailMesh);
  }

  _buildHealthBar() {
    // 3D Billboard Health Bar
    const bgGeo = new THREE.PlaneGeometry(1.6, 0.18);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide });
    this.hpBg = new THREE.Mesh(bgGeo, bgMat);
    this.hpBg.position.set(0, 1.4, 0);

    const fillGeo = new THREE.PlaneGeometry(1.5, 0.14);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
    this.hpFill = new THREE.Mesh(fillGeo, fillMat);
    this.hpFill.position.set(0, 0, 0.01);
    this.hpBg.add(this.hpFill);

    this.add(this.hpBg);
  }

  _pickNewPatrolTarget() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * this.patrolRadius;
    const alt = 40 + Math.random() * 60;
    this.patrolTarget.set(
      this.patrolOrigin.x + Math.cos(angle) * dist,
      alt,
      this.patrolOrigin.z + Math.sin(angle) * dist
    );
  }

  takeDamage(amount, attacker) {
    if (this.isDead) return;
    this.health -= amount;
    this.aiState = 'chase'; // Instantly aggro on attacker

    // Update HP bar visual
    const pct = Math.max(0, this.health / this.maxHealth);
    this.hpFill.scale.x = pct;
    this.hpFill.position.x = -(1 - pct) * 0.75;

    if (this.health <= 0) {
      this.die(attacker);
    }
  }

  die(attacker) {
    this.isDead = true;
    this.scene.remove(this);

    // Reward player with resources & exp
    if (attacker && attacker.inventory) {
      attacker.inventory.feathers = (attacker.inventory.feathers || 0) + 3;
      attacker.inventory.pebbles = (attacker.inventory.pebbles || 0) + 2;
      attacker.inventory.berries = (attacker.inventory.berries || 0) + 1;
      if (window.onResourceCollected) {
        window.onResourceCollected('VICTORY REWARD (Feathers + Pebbles)', attacker.inventory);
      }
    }
  }

  update(delta, player, combatSystem, camera) {
    if (this.isDead) return;

    // Billboard health bar towards camera
    if (camera) {
      this.hpBg.quaternion.copy(camera.quaternion);
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    // AI Decision Tree
    const distToPlayer = this.position.distanceTo(player.position);

    if (distToPlayer < 75 && !player.isGrounded) {
      this.aiState = 'chase';
    } else if (distToPlayer > 130) {
      this.aiState = 'patrol';
    }

    let targetPoint = this.patrolTarget;
    if (this.aiState === 'chase') {
      targetPoint = player.position.clone().add(new THREE.Vector3(0, 1.5, 0));

      // Attack if in range and ready
      if (distToPlayer < this.attackRange && this.attackCooldown <= 0) {
        this.attackCooldown = 2.4;
        // Shoot enemy feather projectile towards player
        const shootDir = player.position.clone().sub(this.position).normalize();
        combatSystem.spawnWindBlade(this.position, shootDir, 18, 'enemy');
      }
    } else {
      // Check patrol waypoint proximity
      if (this.position.distanceTo(this.patrolTarget) < 15) {
        this._pickNewPatrolTarget();
      }
    }

    // Steering towards target
    const desiredDir = targetPoint.clone().sub(this.position).normalize();
    const currentDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);

    // Smoothly turn towards desired direction
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), desiredDir);
    this.quaternion.slerp(targetQuat, delta * 2.8);

    // Move forward
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    this.velocity.copy(forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, delta);

    // Wing flapping animation
    this.flapCycle += delta * 12;
    const flap = Math.sin(this.flapCycle) * 0.6;
    this.leftWing.rotation.z = flap;
    this.rightWing.rotation.z = -flap;
  }
}
